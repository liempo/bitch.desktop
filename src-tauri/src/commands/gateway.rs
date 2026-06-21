use crate::hermes::gateway_ws;

#[tauri::command]
pub async fn connect_ws(
    app: tauri::AppHandle,
    connection_id: String,
    profile: Option<String>,
) -> Result<(), String> {
    gateway_ws::connect_ws(app, connection_id, profile).await
}

#[tauri::command]
pub async fn send_ws_message(connection_id: String, message: String) -> Result<(), String> {
    gateway_ws::send_ws_message(connection_id, message).await
}

#[tauri::command]
pub async fn close_ws(connection_id: String) -> Result<(), String> {
    gateway_ws::close_ws(connection_id).await
}
