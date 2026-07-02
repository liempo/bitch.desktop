use tauri::State;

use crate::calendar::caldav::{CalendarEvent, CalendarEventRange};
use crate::calendar::config::{caldav_config_status, CalDavConfigStatus};
use crate::calendar::sync::{CalendarSyncState, CalendarSyncStatus};
use crate::errors::AppResult;

#[tauri::command]
pub fn get_caldav_config_status(
    state: State<'_, CalendarSyncState>,
) -> AppResult<CalDavConfigStatus> {
    let mut status = caldav_config_status();
    let sync_status = state.status()?;

    status.cached_sources = sync_status.cached_sources;
    status.last_sync_error = sync_status.last_error;
    status.last_synced_at = sync_status.last_synced_at;
    status.sync_interval_seconds = sync_status.sync_interval_seconds;
    status.syncing = sync_status.syncing;

    Ok(status)
}

#[tauri::command]
pub fn list_calendar_events(
    state: State<'_, CalendarSyncState>,
    range: CalendarEventRange,
) -> AppResult<Vec<CalendarEvent>> {
    state.list_events(range)
}

#[tauri::command]
pub async fn sync_calendar_events(
    state: State<'_, CalendarSyncState>,
) -> AppResult<CalendarSyncStatus> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.sync_now_blocking())
        .await
        .map_err(|e| format!("CalDAV sync worker failed: {e}"))?
}
