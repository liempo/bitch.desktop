use serde::Serialize;

use crate::config::config_value;

pub const CALDAV_CONFIG_HINT: &str =
    "Set CALDAV_URL to a CalDAV endpoint or calendar collection URL, plus CALDAV_USERNAME and CALDAV_PASSWORD.";

#[derive(Clone, Debug)]
pub struct CalDavConfig {
    pub calendar_url: String,
    pub display_name: Option<String>,
    pub password: String,
    pub username: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalDavConfigStatus {
    pub calendar_url: Option<String>,
    pub configured: bool,
    pub hint: String,
    pub username: Option<String>,
    pub cached_sources: usize,
    pub last_sync_error: Option<String>,
    pub last_synced_at: Option<String>,
    pub sync_interval_seconds: u64,
    pub syncing: bool,
}

pub const DEFAULT_CALDAV_SYNC_INTERVAL_SECONDS: u64 = 30 * 60;

fn configured_caldav_url_from(get_value: &impl Fn(&str) -> Option<String>) -> Option<String> {
    get_value("CALDAV_URL")
}

pub fn normalize_caldav_url(raw_url: &str) -> Result<String, String> {
    let value = raw_url.trim();

    if value.is_empty() {
        return Err(format!("CalDAV URL is required. {CALDAV_CONFIG_HINT}"));
    }

    let parsed = url::Url::parse(value).map_err(|e| format!("Invalid CalDAV URL: {e}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!(
            "CalDAV URL must be http:// or https://, got {}",
            parsed.scheme()
        ));
    }

    Ok(parsed.as_str().to_string())
}

pub fn resolve_caldav_config() -> Result<CalDavConfig, String> {
    resolve_caldav_config_from(config_value)
}

pub fn resolve_caldav_sync_interval_seconds() -> u64 {
    resolve_caldav_sync_interval_seconds_from(config_value)
}

fn resolve_caldav_sync_interval_seconds_from(get_value: impl Fn(&str) -> Option<String>) -> u64 {
    get_value("CALDAV_SYNC_INTERVAL")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_CALDAV_SYNC_INTERVAL_SECONDS)
}

fn resolve_caldav_config_from(
    get_value: impl Fn(&str) -> Option<String>,
) -> Result<CalDavConfig, String> {
    let calendar_url = normalize_caldav_url(
        &configured_caldav_url_from(&get_value)
            .ok_or_else(|| format!("CalDAV URL is not configured. {CALDAV_CONFIG_HINT}"))?,
    )?;
    let username = get_value("CALDAV_USERNAME")
        .or_else(|| get_value("CALDAV_USER"))
        .ok_or_else(|| format!("CalDAV username is not configured. {CALDAV_CONFIG_HINT}"))?;
    let password = get_value("CALDAV_PASSWORD")
        .ok_or_else(|| format!("CalDAV password is not configured. {CALDAV_CONFIG_HINT}"))?;
    let display_name = get_value("CALDAV_DISPLAY_NAME");

    Ok(CalDavConfig {
        calendar_url,
        display_name,
        password,
        username,
    })
}

pub fn caldav_config_status() -> CalDavConfigStatus {
    match resolve_caldav_config() {
        Ok(config) => CalDavConfigStatus {
            calendar_url: Some(config.calendar_url),
            configured: true,
            hint: String::new(),
            username: Some(config.username),
            cached_sources: 0,
            last_sync_error: None,
            last_synced_at: None,
            sync_interval_seconds: resolve_caldav_sync_interval_seconds(),
            syncing: false,
        },
        Err(error) => CalDavConfigStatus {
            calendar_url: config_value("CALDAV_URL")
                .and_then(|value| normalize_caldav_url(&value).ok()),
            configured: false,
            hint: error,
            username: config_value("CALDAV_USERNAME").or_else(|| config_value("CALDAV_USER")),
            cached_sources: 0,
            last_sync_error: None,
            last_synced_at: None,
            sync_interval_seconds: resolve_caldav_sync_interval_seconds(),
            syncing: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve_with_values(pairs: &[(&str, &str)]) -> Result<CalDavConfig, String> {
        resolve_caldav_config_from(|name| {
            pairs.iter().find_map(|(key, value)| {
                if *key != name {
                    return None;
                }

                let value = value.trim().to_string();
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            })
        })
    }

    #[test]
    fn resolves_caldav_endpoint_url_and_credentials() {
        let config = resolve_with_values(&[
            (
                "CALDAV_URL",
                "https://calendar.example.test/dav/operator/calendar/",
            ),
            ("CALDAV_USERNAME", "operator"),
            ("CALDAV_PASSWORD", "secret"),
            ("CALDAV_DISPLAY_NAME", "Ops"),
        ])
        .unwrap();

        assert_eq!(
            config.calendar_url,
            "https://calendar.example.test/dav/operator/calendar/"
        );
        assert_eq!(config.username, "operator");
        assert_eq!(config.password, "secret");
        assert_eq!(config.display_name.as_deref(), Some("Ops"));
    }

    #[test]
    fn rejects_missing_or_non_http_caldav_config() {
        assert!(resolve_with_values(&[]).unwrap_err().contains("CALDAV_URL"));
        assert!(resolve_with_values(&[
            ("CALDAV_URL", "file:///calendar"),
            ("CALDAV_USERNAME", "operator"),
            ("CALDAV_PASSWORD", "secret"),
        ])
        .is_err());
    }

    #[test]
    fn resolves_background_sync_interval_seconds() {
        assert_eq!(resolve_caldav_sync_interval_seconds_from(|_| None), 1800);
        assert_eq!(
            resolve_caldav_sync_interval_seconds_from(|name| {
                (name == "CALDAV_SYNC_INTERVAL").then(|| "60".to_string())
            }),
            60
        );
        assert_eq!(
            resolve_caldav_sync_interval_seconds_from(|name| {
                (name == "CALDAV_SYNC_INTERVAL").then(|| "0".to_string())
            }),
            0
        );
    }
}
