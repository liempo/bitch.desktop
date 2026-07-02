use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

use reqwest::header::{HeaderMap, COOKIE, SET_COOKIE};
use serde::Serialize;

use crate::{
    config::config_value,
    hermes::config::GatewayConfig,
    http::{build_api_url, summarize_response_body},
};

const DEFAULT_PASSWORD_PROVIDER: &str = "basic";
const PASSWORD_LOGIN_PATH: &str = "/auth/password-login";

#[derive(Clone)]
pub struct PasswordLoginCredentials {
    provider: String,
    username: String,
    password: String,
}

#[derive(Serialize)]
struct PasswordLoginRequest<'a> {
    provider: &'a str,
    username: &'a str,
    password: &'a str,
    next: &'a str,
}

static SESSION_COOKIES: LazyLock<Mutex<HashMap<String, HashMap<String, String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn session_key(base_url: &str) -> String {
    base_url.trim_end_matches('/').to_string()
}

fn parse_set_cookie(value: &reqwest::header::HeaderValue) -> Option<(String, String, bool)> {
    let raw = value.to_str().ok()?.trim();
    let cookie_pair = raw.split(';').next()?.trim();
    let (name, value) = cookie_pair.split_once('=')?;
    let name = name.trim();

    if name.is_empty() {
        return None;
    }

    let lower = raw.to_ascii_lowercase();
    let expires_immediately = lower.contains("max-age=0")
        || lower.contains("max-age=-")
        || lower.contains("expires=thu, 01 jan 1970");

    Some((
        name.to_string(),
        value.trim().to_string(),
        expires_immediately,
    ))
}

fn configured_password_login_credentials() -> Option<PasswordLoginCredentials> {
    let username = config_value("HERMES_DASHBOARD_USERNAME")?;
    let password = config_value("HERMES_DASHBOARD_PASSWORD")?;
    let provider = config_value("HERMES_DASHBOARD_AUTH_PROVIDER")
        .or_else(|| config_value("HERMES_DASHBOARD_PROVIDER"))
        .unwrap_or_else(|| DEFAULT_PASSWORD_PROVIDER.to_string());

    Some(PasswordLoginCredentials {
        provider,
        username,
        password,
    })
}

fn password_login_request(credentials: &PasswordLoginCredentials) -> PasswordLoginRequest<'_> {
    PasswordLoginRequest {
        provider: &credentials.provider,
        username: &credentials.username,
        password: &credentials.password,
        next: "/",
    }
}

pub fn capture_response_cookies(base_url: &str, headers: &HeaderMap) {
    let updates = headers
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(parse_set_cookie)
        .collect::<Vec<_>>();

    if updates.is_empty() {
        return;
    }

    let key = session_key(base_url);
    let Ok(mut store) = SESSION_COOKIES.lock() else {
        return;
    };
    let jar = store.entry(key).or_default();

    for (name, value, expires_immediately) in updates {
        if expires_immediately || value.is_empty() {
            jar.remove(&name);
        } else {
            jar.insert(name, value);
        }
    }
}

pub fn clear_session_cookies(base_url: &str) {
    let Ok(mut store) = SESSION_COOKIES.lock() else {
        return;
    };

    store.remove(&session_key(base_url));
}

pub fn session_cookie_header(base_url: &str) -> Option<String> {
    let Ok(store) = SESSION_COOKIES.lock() else {
        return None;
    };
    let jar = store.get(&session_key(base_url))?;

    if jar.is_empty() {
        return None;
    }

    let mut cookies = jar
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>();
    cookies.sort();

    Some(cookies.join("; "))
}

pub async fn session_cookie_header_or_login(
    client: &reqwest::Client,
    config: &GatewayConfig,
) -> Result<String, String> {
    if !config.uses_session_auth() {
        return Err(
            "Internal error: session auth requested for a token-mode connection".to_string(),
        );
    }

    if let Some(cookies) = session_cookie_header(&config.base_url) {
        return Ok(cookies);
    }

    password_login_from_config(client, &config.base_url).await?;
    session_cookie_header(&config.base_url).ok_or_else(|| {
        "Hermes password login succeeded but did not return dashboard session cookies".to_string()
    })
}

pub async fn password_login_from_config(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<(), String> {
    let credentials = configured_password_login_credentials().ok_or_else(|| {
        "Hermes dashboard session auth is selected, but hermes.username and hermes.password are not set in ~/.bitch/config.yaml".to_string()
    })?;

    password_login(client, base_url, credentials).await
}

async fn password_login(
    client: &reqwest::Client,
    base_url: &str,
    credentials: PasswordLoginCredentials,
) -> Result<(), String> {
    let url = build_api_url(base_url, PASSWORD_LOGIN_PATH);
    let response = client
        .post(url)
        .header("Accept", "application/json")
        .json(&password_login_request(&credentials))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    capture_response_cookies(base_url, response.headers());
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "Hermes password login with provider '{}' returned {status}: {}",
            credentials.provider,
            summarize_response_body(&text)
        ));
    }

    if !text.trim().is_empty() {
        let body = serde_json::from_str::<serde_json::Value>(&text).map_err(|e| {
            format!(
                "Hermes password login returned invalid JSON: {e}; body: {}",
                summarize_response_body(&text)
            )
        })?;

        if body.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
            return Err(format!(
                "Hermes password login with provider '{}' was rejected: {}",
                credentials.provider,
                summarize_response_body(&text)
            ));
        }
    }

    if session_cookie_header(base_url).is_none() {
        return Err(
            "Hermes password login succeeded but did not return dashboard session cookies"
                .to_string(),
        );
    }

    Ok(())
}

pub async fn attach_session_cookie(
    client: &reqwest::Client,
    config: &GatewayConfig,
    builder: reqwest::RequestBuilder,
) -> Result<reqwest::RequestBuilder, String> {
    let cookies = session_cookie_header_or_login(client, config).await?;
    Ok(builder.header(COOKIE, cookies))
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderValue;

    #[test]
    fn parses_set_cookie_headers_without_exposing_attributes() {
        let value =
            HeaderValue::from_static("hermes_session_at=abc.def; HttpOnly; Path=/; SameSite=Lax");

        assert_eq!(
            parse_set_cookie(&value),
            Some((
                "hermes_session_at".to_string(),
                "abc.def".to_string(),
                false
            ))
        );
    }

    #[test]
    fn detects_expiring_set_cookie_headers() {
        let value = HeaderValue::from_static("hermes_session_at=; Max-Age=0; Path=/");

        assert_eq!(
            parse_set_cookie(&value),
            Some(("hermes_session_at".to_string(), "".to_string(), true))
        );
    }

    #[test]
    fn password_login_body_matches_hermes_basic_provider_contract() {
        let credentials = PasswordLoginCredentials {
            provider: "basic".to_string(),
            username: "admin".to_string(),
            password: "secret".to_string(),
        };

        assert_eq!(
            serde_json::to_value(password_login_request(&credentials)).unwrap(),
            serde_json::json!({
                "provider": "basic",
                "username": "admin",
                "password": "secret",
                "next": "/"
            })
        );
    }

    #[test]
    fn stores_cookies_per_dashboard_base_url() {
        let base_url = "https://hermes.example.test";
        clear_session_cookies(base_url);

        let mut headers = HeaderMap::new();
        headers.append(
            SET_COOKIE,
            HeaderValue::from_static("hermes_session_at=access-token; HttpOnly; Path=/"),
        );
        headers.append(
            SET_COOKIE,
            HeaderValue::from_static("hermes_session_rt=refresh-token; HttpOnly; Path=/"),
        );

        capture_response_cookies(base_url, &headers);

        assert_eq!(
            session_cookie_header(base_url).as_deref(),
            Some("hermes_session_at=access-token; hermes_session_rt=refresh-token")
        );

        clear_session_cookies(base_url);
        assert!(session_cookie_header(base_url).is_none());
    }
}
