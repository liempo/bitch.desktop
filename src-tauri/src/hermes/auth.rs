use serde_json::Value;

use crate::{
    hermes::config::GatewayConfig,
    http::{build_api_url, summarize_response_body},
};

pub const DEFAULT_STATUS_PATH: &str = "/api/status";
pub const DEFAULT_WS_PATH: &str = "/api/ws";
pub const WS_TICKET_PATH: &str = "/api/auth/ws-ticket";
pub const AUTH_HEADER: &str = "X-Hermes-Session-Token";

pub async fn fetch_gateway_status(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<(Value, reqwest::StatusCode), String> {
    let url = build_api_url(base_url, DEFAULT_STATUS_PATH);
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();

    if !status.is_success() {
        return Err(format!("gateway returned {status}"));
    }

    let body = response.json::<Value>().await.map_err(|e| e.to_string())?;

    Ok((body, status))
}

pub fn status_requires_ws_ticket(status: &Value) -> bool {
    status
        .get("auth_required")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub async fn mint_ws_ticket(
    client: &reqwest::Client,
    config: &GatewayConfig,
) -> Result<String, String> {
    let url = build_api_url(&config.base_url, WS_TICKET_PATH);
    let response = client
        .post(url)
        .header(AUTH_HEADER, &config.token)
        .header("Accept", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "ws-ticket endpoint returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    let body = serde_json::from_str::<Value>(&text)
        .map_err(|e| format!("Invalid JSON from ws-ticket endpoint: {e}"))?;
    let ticket = body
        .get("ticket")
        .and_then(Value::as_str)
        .filter(|ticket| !ticket.is_empty())
        .ok_or_else(|| "Gateway did not return a WS ticket".to_string())?;

    Ok(ticket.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_auth_required_flag_controls_ws_ticket_use() {
        assert!(status_requires_ws_ticket(
            &serde_json::json!({ "auth_required": true })
        ));
        assert!(!status_requires_ws_ticket(
            &serde_json::json!({ "auth_required": false })
        ));
        assert!(!status_requires_ws_ticket(&serde_json::json!({})));
    }
}
