use crate::calendar::caldav;
use crate::calendar::caldav::{CalendarEvent, CalendarEventRange};
use crate::calendar::config::{caldav_config_status, resolve_caldav_config, CalDavConfigStatus};
use crate::errors::AppResult;

#[tauri::command]
pub fn get_caldav_config_status() -> AppResult<CalDavConfigStatus> {
    Ok(caldav_config_status())
}

#[tauri::command]
pub async fn list_calendar_events(range: CalendarEventRange) -> AppResult<Vec<CalendarEvent>> {
    let config = resolve_caldav_config()?;
    caldav::list_calendar_events_impl(config, range).await
}
