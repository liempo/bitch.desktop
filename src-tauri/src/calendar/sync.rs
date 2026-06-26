use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::calendar::{
    caldav::{self, CachedCalendarSource, CalendarEvent, CalendarEventRange},
    config::{resolve_caldav_config, resolve_caldav_sync_interval_seconds},
};

pub const CALENDAR_SYNC_EVENT: &str = "calendar-sync-updated";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSyncStatus {
    pub cached_sources: usize,
    pub last_error: Option<String>,
    pub last_synced_at: Option<String>,
    pub sync_interval_seconds: u64,
    pub syncing: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarCacheFile {
    last_synced_at: Option<String>,
    sources: Vec<CachedCalendarSource>,
    version: u32,
}

#[derive(Debug, Default)]
struct CalendarSyncInner {
    last_error: Option<String>,
    last_synced_at: Option<String>,
    sources: Vec<CachedCalendarSource>,
    syncing: bool,
}

#[derive(Clone, Debug)]
pub struct CalendarSyncState {
    inner: Arc<Mutex<CalendarSyncInner>>,
    sync_interval_seconds: u64,
}

impl CalendarSyncState {
    pub fn new() -> Self {
        let sync_interval_seconds = resolve_caldav_sync_interval_seconds();
        let inner = read_cache_file()
            .map(|cache| CalendarSyncInner {
                last_synced_at: cache.last_synced_at,
                sources: cache.sources,
                ..Default::default()
            })
            .unwrap_or_default();

        Self {
            inner: Arc::new(Mutex::new(inner)),
            sync_interval_seconds,
        }
    }

    pub fn list_events(&self, range: CalendarEventRange) -> Result<Vec<CalendarEvent>, String> {
        let sources = self.with_inner(|inner| inner.sources.clone())?;
        caldav::calendar_events_from_cached_sources(&sources, &range)
    }

    pub fn status(&self) -> Result<CalendarSyncStatus, String> {
        self.with_inner(|inner| self.status_from_inner(inner))
    }

    pub fn sync_interval_seconds(&self) -> u64 {
        self.sync_interval_seconds
    }

    pub fn sync_now_blocking(&self) -> Result<CalendarSyncStatus, String> {
        let already_syncing = self.with_inner(|inner| {
            if inner.syncing {
                true
            } else {
                inner.syncing = true;
                inner.last_error = None;
                false
            }
        })?;

        if already_syncing {
            return self.status();
        }

        let result = resolve_caldav_config()
            .and_then(|config| caldav::sync_calendar_sources_blocking(&config));
        match result {
            Ok(sources) => {
                let last_synced_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
                let cache_file = CalendarCacheFile {
                    last_synced_at: Some(last_synced_at.clone()),
                    sources: sources.clone(),
                    version: 1,
                };
                let cache_error = write_cache_file(&cache_file).err();

                self.with_inner(|inner| {
                    inner.sources = sources;
                    inner.last_synced_at = Some(last_synced_at);
                    inner.last_error = cache_error;
                    inner.syncing = false;
                    self.status_from_inner(inner)
                })
            }
            Err(error) => {
                let status = self.with_inner(|inner| {
                    inner.last_error = Some(error.clone());
                    inner.syncing = false;
                    self.status_from_inner(inner)
                })?;

                if status.cached_sources > 0 {
                    Ok(status)
                } else {
                    Err(error)
                }
            }
        }
    }

    fn status_from_inner(&self, inner: &CalendarSyncInner) -> CalendarSyncStatus {
        CalendarSyncStatus {
            cached_sources: inner.sources.len(),
            last_error: inner.last_error.clone(),
            last_synced_at: inner.last_synced_at.clone(),
            sync_interval_seconds: self.sync_interval_seconds,
            syncing: inner.syncing,
        }
    }

    fn with_inner<T>(&self, read: impl FnOnce(&mut CalendarSyncInner) -> T) -> Result<T, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Calendar sync cache lock is poisoned".to_string())?;
        Ok(read(&mut inner))
    }
}

pub fn start_background_sync(app: AppHandle, state: CalendarSyncState) {
    tauri::async_runtime::spawn(async move {
        sync_and_emit(&app, &state).await;

        let interval_seconds = state.sync_interval_seconds();
        if interval_seconds == 0 {
            return;
        }

        let interval = Duration::from_secs(interval_seconds);
        loop {
            tokio::time::sleep(interval).await;
            sync_and_emit(&app, &state).await;
        }
    });
}

async fn sync_and_emit(app: &AppHandle, state: &CalendarSyncState) {
    let interval_seconds = state.sync_interval_seconds();
    let state_for_sync = state.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || state_for_sync.sync_now_blocking()).await;
    let status = match result {
        Ok(Ok(status)) => status,
        Ok(Err(error)) => CalendarSyncStatus {
            cached_sources: 0,
            last_error: Some(error),
            last_synced_at: None,
            sync_interval_seconds: interval_seconds,
            syncing: false,
        },
        Err(error) => CalendarSyncStatus {
            cached_sources: 0,
            last_error: Some(format!("CalDAV sync worker failed: {error}")),
            last_synced_at: None,
            sync_interval_seconds: interval_seconds,
            syncing: false,
        },
    };

    let _ = app.emit(CALENDAR_SYNC_EVENT, status);
}

fn read_cache_file() -> Result<CalendarCacheFile, String> {
    let path = cache_path()?;
    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str::<CalendarCacheFile>(&contents)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn write_cache_file(cache: &CalendarCacheFile) -> Result<(), String> {
    let path = cache_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let body = serde_json::to_string(cache).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

fn cache_path() -> Result<PathBuf, String> {
    Ok(cache_base_dir()?.join("bitch").join("calendar-cache.json"))
}

fn cache_base_dir() -> Result<PathBuf, String> {
    if let Some(cache_home) = std::env::var_os("XDG_CACHE_HOME") {
        return Ok(PathBuf::from(cache_home));
    }

    if let Some(home) = std::env::var_os("HOME") {
        return Ok(PathBuf::from(home).join(".cache"));
    }

    Err("Could not resolve a cache directory for CalDAV events".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_file_round_trips_sources() {
        let cache = CalendarCacheFile {
            last_synced_at: Some("2026-06-25T01:00:00Z".to_string()),
            sources: vec![CachedCalendarSource {
                calendar_name: "Personal".to_string(),
                etag: Some("abc".to_string()),
                ical: "BEGIN:VCALENDAR\nEND:VCALENDAR".to_string(),
                source_url: "https://calendar.example.test/event.ics".to_string(),
            }],
            version: 1,
        };

        let body = serde_json::to_string(&cache).unwrap();
        let parsed = serde_json::from_str::<CalendarCacheFile>(&body).unwrap();

        assert_eq!(parsed.last_synced_at, cache.last_synced_at);
        assert_eq!(parsed.sources.len(), 1);
        assert_eq!(parsed.sources[0].calendar_name, "Personal");
    }
}
