use crate::{
    config::{save_connection_config_to_disk, ConnectionConfig},
    errors::AppResult,
    hermes::config::{self as hermes_config, ResolvedConnection},
};

#[tauri::command]
pub async fn get_connection_config() -> AppResult<ConnectionConfig> {
    hermes_config::load_connection_config()
}

#[tauri::command]
pub async fn save_connection_config(config: ConnectionConfig) -> AppResult<ConnectionConfig> {
    save_connection_config_to_disk(&config)?;
    Ok(config)
}

#[tauri::command]
pub async fn resolve_connection(profile: Option<String>) -> AppResult<ResolvedConnection> {
    hermes_config::resolve_connection(profile.as_deref())
}
