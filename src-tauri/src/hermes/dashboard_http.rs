use serde::Deserialize;
use serde_json::Value;

use crate::{
    hermes::{auth::AUTH_HEADER, config::GatewayConfig, session_auth},
    http::{build_api_url, normalize_request_method, summarize_response_body},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardRequest {
    pub body: Option<Value>,
    pub method: Option<String>,
    pub path: String,
    pub profile: Option<String>,
}

fn normalize_dashboard_method(method: Option<String>) -> Result<reqwest::Method, String> {
    normalize_request_method(method, "dashboard_request")
}

fn validate_dashboard_path(path: &str) -> Result<&str, String> {
    let path = path.trim();

    if !path.starts_with("/api/") {
        return Err("dashboard_request path must start with /api/".to_string());
    }

    Ok(path)
}

async fn build_dashboard_request(
    client: &reqwest::Client,
    config: &GatewayConfig,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<reqwest::RequestBuilder, String> {
    let mut builder = client
        .request(method, url)
        .header("Accept", "application/json");

    if config.uses_session_auth() {
        builder = session_auth::attach_session_cookie(client, config, builder).await?;
    } else {
        builder = builder.header(AUTH_HEADER, config.required_token()?);
    }

    if let Some(body) = body {
        builder = builder.json(&body);
    }

    Ok(builder)
}

pub async fn dashboard_request_impl(
    client: &reqwest::Client,
    config: &GatewayConfig,
    request: DashboardRequest,
) -> Result<Value, String> {
    let path = validate_dashboard_path(&request.path)?;
    let method = normalize_dashboard_method(request.method)?;
    let url = build_api_url(&config.base_url, path);
    let body = request.body;

    for attempt in 0..2 {
        let builder =
            build_dashboard_request(client, config, method.clone(), &url, body.clone()).await?;
        let response = builder.send().await.map_err(|e| e.to_string())?;
        let status = response.status();

        if config.uses_session_auth() {
            session_auth::capture_response_cookies(&config.base_url, response.headers());

            if status == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                session_auth::clear_session_cookies(&config.base_url);
                continue;
            }
        }

        let text = response.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            let message = if config.uses_session_auth()
                && status == reqwest::StatusCode::UNAUTHORIZED
            {
                "Remote Hermes session expired or login was rejected; check HERMES_DASHBOARD_USERNAME and HERMES_DASHBOARD_PASSWORD, then try again".to_string()
            } else {
                format!(
                    "dashboard request returned {status}: {}",
                    summarize_response_body(&text)
                )
            };

            return Err(message);
        }

        if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
            return Ok(Value::Null);
        }

        return serde_json::from_str::<Value>(&text).map_err(|e| {
            format!(
                "dashboard request returned invalid JSON: {e}; body: {}",
                summarize_response_body(&text)
            )
        });
    }

    Err("dashboard request failed after refreshing the Hermes session".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_dashboard_api_paths() {
        assert_eq!(
            validate_dashboard_path(" /api/status ").unwrap(),
            "/api/status"
        );
        assert!(validate_dashboard_path("/status").is_err());
        assert!(validate_dashboard_path("https://example.test/api/status").is_err());
    }
}
