use serde_json::Value;

use crate::errors::AppResult;
use crate::monitoring::beszel;
use crate::monitoring::beszel::MonitoringRequest;
use crate::monitoring::config::{resolve_monitoring_config, ResolvedMonitoringConfig};

#[tauri::command]
pub async fn get_monitoring_config() -> AppResult<ResolvedMonitoringConfig> {
    Ok(resolve_monitoring_config()?.resolved_public_config())
}

#[tauri::command]
pub async fn monitoring_request(
    client: tauri::State<'_, reqwest::Client>,
    request: MonitoringRequest,
) -> AppResult<Value> {
    let config = resolve_monitoring_config()?;
    beszel::monitoring_request_impl(&client, &config, request).await
}
