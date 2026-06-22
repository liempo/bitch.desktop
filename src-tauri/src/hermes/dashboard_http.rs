use serde::Deserialize;
use serde_json::Value;

use crate::{
    hermes::{auth::AUTH_HEADER, config::GatewayConfig},
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

pub async fn dashboard_request_impl(
    client: &reqwest::Client,
    config: &GatewayConfig,
    request: DashboardRequest,
) -> Result<Value, String> {
    let path = validate_dashboard_path(&request.path)?;
    let method = normalize_dashboard_method(request.method)?;
    let url = build_api_url(&config.base_url, path);

    let mut builder = client
        .request(method, url)
        .header(AUTH_HEADER, &config.token)
        .header("Accept", "application/json");

    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "dashboard request returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str::<Value>(&text).map_err(|e| {
        format!(
            "dashboard request returned invalid JSON: {e}; body: {}",
            summarize_response_body(&text)
        )
    })
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
