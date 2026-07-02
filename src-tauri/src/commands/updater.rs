use crate::{errors::AppResult, updater};

#[tauri::command]
pub async fn check_source_update() -> AppResult<updater::SourceUpdateStatus> {
    updater::check_source_update()
}

#[tauri::command]
pub async fn run_source_update() -> AppResult<updater::SourceUpdateResult> {
    updater::run_source_update()
}
