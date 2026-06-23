use crate::errors::AppResult;
use crate::platform::{app_icon, external_url};

#[tauri::command]
pub async fn open_external_url(url: String) -> AppResult<()> {
    external_url::open_external_url(url)
}

#[tauri::command]
pub fn set_dynamic_app_icon(app: tauri::AppHandle, png_bytes: Vec<u8>) -> AppResult<()> {
    app_icon::set_dynamic_app_icon(&app, png_bytes)
}

#[tauri::command]
pub fn reset_dynamic_app_icon(app: tauri::AppHandle) -> AppResult<()> {
    app_icon::reset_dynamic_app_icon(&app)
}
