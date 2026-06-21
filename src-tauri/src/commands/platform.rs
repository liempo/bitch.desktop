use crate::platform::external_url;

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    external_url::open_external_url(url)
}
