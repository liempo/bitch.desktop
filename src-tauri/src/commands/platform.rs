use crate::errors::AppResult;
use crate::platform::external_url;

#[tauri::command]
pub async fn open_external_url(url: String) -> AppResult<()> {
    external_url::open_external_url(url)
}
