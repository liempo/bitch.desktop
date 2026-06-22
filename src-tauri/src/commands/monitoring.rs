use serde_json::Value;

use crate::errors::AppResult;
use crate::monitoring::beszel;
use crate::monitoring::beszel::HostMonitorRequest;
use crate::monitoring::config::resolve_host_monitor_config;

#[tauri::command]
pub async fn host_monitor_request(
    client: tauri::State<'_, reqwest::Client>,
    request: HostMonitorRequest,
) -> AppResult<Value> {
    let config = resolve_host_monitor_config()?;
    beszel::host_monitor_request_impl(&client, &config, request).await
}
