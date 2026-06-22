use serde_json::Value;

use crate::errors::AppResult;
use crate::hermes::config::resolve_gateway_config;
use crate::hermes::dashboard_http;
use crate::hermes::dashboard_http::DashboardRequest;

#[tauri::command]
pub async fn dashboard_request(
    client: tauri::State<'_, reqwest::Client>,
    request: DashboardRequest,
) -> AppResult<Value> {
    let profile = request.profile.clone();
    let config = resolve_gateway_config(profile.as_deref())?;
    dashboard_http::dashboard_request_impl(&client, &config, request).await
}
