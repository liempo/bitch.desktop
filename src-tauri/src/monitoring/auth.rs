use serde_json::Value;
use std::sync::{LazyLock, Mutex};

use crate::{
    http::{build_api_url, summarize_response_body},
    monitoring::config::{MonitoringAuth, MonitoringConfig},
};

static MONITORING_AUTH_TOKEN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

pub fn clear_cached_monitoring_token() -> Result<(), String> {
    let mut token = MONITORING_AUTH_TOKEN.lock().map_err(|e| e.to_string())?;
    *token = None;
    Ok(())
}

fn cached_monitoring_token() -> Result<Option<String>, String> {
    MONITORING_AUTH_TOKEN
        .lock()
        .map_err(|e| e.to_string())
        .map(|token| token.clone())
}

fn cache_monitoring_token(token: String) -> Result<(), String> {
    *MONITORING_AUTH_TOKEN.lock().map_err(|e| e.to_string())? = Some(token);
    Ok(())
}

pub async fn monitoring_auth_token(
    client: &reqwest::Client,
    config: &MonitoringConfig,
    refresh: bool,
) -> Result<Option<String>, String> {
    match &config.auth {
        MonitoringAuth::None => Ok(None),
        MonitoringAuth::StaticToken(token) => Ok(Some(token.clone())),
        MonitoringAuth::Password { identity, password } => {
            if refresh {
                clear_cached_monitoring_token()?;
            }

            if let Some(token) = cached_monitoring_token()? {
                return Ok(Some(token));
            }

            let url = build_api_url(
                &config.base_url,
                "/api/collections/users/auth-with-password",
            );
            let response = client
                .post(url)
                .header("Accept", "application/json")
                .json(&serde_json::json!({ "identity": identity, "password": password }))
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = response.status();
            let text = response.text().await.map_err(|e| e.to_string())?;

            if !status.is_success() {
                return Err(format!(
                    "Beszel monitoring auth returned {status}: {}",
                    summarize_response_body(&text)
                ));
            }

            let body = serde_json::from_str::<Value>(&text).map_err(|e| {
                format!(
                    "Beszel monitoring auth returned invalid JSON: {e}; body: {}",
                    summarize_response_body(&text)
                )
            })?;
            let token = body
                .get("token")
                .and_then(Value::as_str)
                .filter(|token| !token.is_empty())
                .ok_or_else(|| "Beszel monitoring auth did not return a token".to_string())?
                .to_string();

            cache_monitoring_token(token.clone())?;

            Ok(Some(token))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clears_cached_password_auth_token() {
        cache_monitoring_token("cached-token".to_string()).unwrap();
        assert_eq!(
            cached_monitoring_token().unwrap().as_deref(),
            Some("cached-token")
        );

        clear_cached_monitoring_token().unwrap();

        assert_eq!(cached_monitoring_token().unwrap(), None);
    }
}
