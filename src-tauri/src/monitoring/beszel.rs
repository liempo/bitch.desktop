use serde::Deserialize;
use serde_json::Value;

use crate::{
    http::{build_api_url, normalize_request_method, summarize_response_body},
    monitoring::{
        auth::host_monitor_auth_token,
        config::{HostMonitorAuth, HostMonitorConfig},
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMonitorRequest {
    body: Option<Value>,
    method: Option<String>,
    path: String,
}

fn validate_host_monitor_path(path: &str) -> Result<&str, String> {
    let path = path.trim();

    if path.starts_with("http://") || path.starts_with("https://") {
        return Err("host_monitor_request path must be a relative /api/ path".to_string());
    }

    if !path.starts_with("/api/") {
        return Err("host_monitor_request path must start with /api/".to_string());
    }

    Ok(path)
}

async fn send_host_monitor_request(
    client: &reqwest::Client,
    config: &HostMonitorConfig,
    request: &HostMonitorRequest,
    refresh_auth: bool,
) -> Result<(reqwest::StatusCode, String), String> {
    let path = validate_host_monitor_path(&request.path)?;
    let method = normalize_request_method(request.method.clone(), "host_monitor_request")?;
    let url = build_api_url(&config.base_url, path);
    let mut builder = client
        .request(method, url)
        .header("Accept", "application/json");

    if let Some(token) = host_monitor_auth_token(client, config, refresh_auth).await? {
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

pub async fn host_monitor_request_impl(
    client: &reqwest::Client,
    config: &HostMonitorConfig,
    request: HostMonitorRequest,
) -> Result<Value, String> {
    let (mut status, mut text) = send_host_monitor_request(client, config, &request, false).await?;

    if matches!(&config.auth, HostMonitorAuth::Password { .. })
        && (status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN)
    {
        (status, text) = send_host_monitor_request(client, config, &request, true).await?;
    }

    if !status.is_success() {
        return Err(format!(
            "host monitor request returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str::<Value>(&text).map_err(|e| {
        format!(
            "host monitor request returned invalid JSON: {e}; body: {}",
            summarize_response_body(&text)
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_host_monitor_api_paths() {
        assert_eq!(
            validate_host_monitor_path(" /api/collections/systems/records ").unwrap(),
            "/api/collections/systems/records"
        );
        assert!(validate_host_monitor_path("https://monitoring.example.test/api/health").is_err());
        assert!(validate_host_monitor_path("/system/el6ygn9w6w41w41").is_err());
    }
}
