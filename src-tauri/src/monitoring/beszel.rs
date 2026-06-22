use serde::Deserialize;
use serde_json::Value;

use crate::{
    http::{build_api_url, normalize_request_method, summarize_response_body},
    monitoring::{
        auth::monitoring_auth_token,
        config::{MonitoringAuth, MonitoringConfig},
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitoringRequest {
    body: Option<Value>,
    method: Option<String>,
    path: String,
}

fn validate_monitoring_path(path: &str) -> Result<&str, String> {
    let path = path.trim();

    if path.starts_with("http://") || path.starts_with("https://") {
        return Err("monitoring_request path must be a relative /api/ path".to_string());
    }

    if !path.starts_with("/api/") {
        return Err("monitoring_request path must start with /api/".to_string());
    }

    Ok(path)
}

async fn send_monitoring_request(
    client: &reqwest::Client,
    config: &MonitoringConfig,
    request: &MonitoringRequest,
    refresh_auth: bool,
) -> Result<(reqwest::StatusCode, String), String> {
    let path = validate_monitoring_path(&request.path)?;
    let method = normalize_request_method(request.method.clone(), "monitoring_request")?;
    let url = build_api_url(&config.base_url, path);
    let mut builder = client
        .request(method, url)
        .header("Accept", "application/json");

    if let Some(token) = monitoring_auth_token(client, config, refresh_auth).await? {
        builder = builder.header("Authorization", token);
    }

    if let Some(body) = &request.body {
        builder = builder.json(body);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    Ok((status, text))
}

pub async fn monitoring_request_impl(
    client: &reqwest::Client,
    config: &MonitoringConfig,
    request: MonitoringRequest,
) -> Result<Value, String> {
    let (mut status, mut text) = send_monitoring_request(client, config, &request, false).await?;

    if matches!(&config.auth, MonitoringAuth::Password { .. })
        && (status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN)
    {
        (status, text) = send_monitoring_request(client, config, &request, true).await?;
    }

    if !status.is_success() {
        return Err(format!(
            "monitoring request returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str::<Value>(&text).map_err(|e| {
        format!(
            "monitoring request returned invalid JSON: {e}; body: {}",
            summarize_response_body(&text)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_monitoring_api_paths() {
        assert_eq!(
            validate_monitoring_path(" /api/collections/systems/records ").unwrap(),
            "/api/collections/systems/records"
        );
        assert!(validate_monitoring_path("https://monitoring.example.test/api/health").is_err());
        assert!(validate_monitoring_path("/system/el6ygn9w6w41w41").is_err());
    }
}
