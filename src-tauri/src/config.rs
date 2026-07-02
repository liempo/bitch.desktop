use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

const APP_CONFIG_DIR: &str = ".bitch";
const APP_CONFIG_FILE: &str = "config.yaml";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConnectionProfileConfig {
    pub auth_mode: Option<String>,
    pub mode: Option<String>,
    pub token: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConnectionConfig {
    pub auth_mode: Option<String>,
    pub mode: Option<String>,
    pub profiles: Option<HashMap<String, ConnectionProfileConfig>>,
    pub token: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HermesConfigFile {
    pub auth_provider: Option<String>,
    pub password: Option<String>,
    pub provider: Option<String>,
    pub username: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MonitoringConfigFile {
    pub auth_token: Option<String>,
    pub email: Option<String>,
    pub identity: Option<String>,
    pub password: Option<String>,
    pub system_id: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarConfigFile {
    pub display_name: Option<String>,
    pub password: Option<String>,
    pub sync_interval_seconds: Option<u64>,
    pub url: Option<String>,
    pub user: Option<String>,
    pub username: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarConfigFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<ConnectionConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hermes: Option<HermesConfigFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitoring: Option<MonitoringConfigFile>,
    #[serde(flatten)]
    pub legacy_env: HashMap<String, serde_yaml::Value>,
}

impl AppConfig {
    fn is_empty(&self) -> bool {
        self.calendar.is_none()
            && self.connection.is_none()
            && self.hermes.is_none()
            && self.monitoring.is_none()
            && self.legacy_env.is_empty()
    }

    fn config_value(&self, name: &str) -> Option<String> {
        let structured = match name {
            "HERMES_DASHBOARD_URL" | "BITCH_DASHBOARD_URL" => self
                .connection
                .as_ref()
                .and_then(|config| clean(config.url.as_deref())),
            "HERMES_DASHBOARD_SESSION_TOKEN" | "BITCH_DASHBOARD_SESSION_TOKEN" => self
                .connection
                .as_ref()
                .and_then(|config| clean(config.token.as_deref())),
            "HERMES_DASHBOARD_USERNAME" | "BITCH_DASHBOARD_USERNAME" => self
                .hermes
                .as_ref()
                .and_then(|config| clean(config.username.as_deref())),
            "HERMES_DASHBOARD_PASSWORD" | "BITCH_DASHBOARD_PASSWORD" => self
                .hermes
                .as_ref()
                .and_then(|config| clean(config.password.as_deref())),
            "HERMES_DASHBOARD_AUTH_PROVIDER" | "BITCH_DASHBOARD_AUTH_PROVIDER" => self
                .hermes
                .as_ref()
                .and_then(|config| clean(config.auth_provider.as_deref())),
            "HERMES_DASHBOARD_PROVIDER" | "BITCH_DASHBOARD_PROVIDER" => self
                .hermes
                .as_ref()
                .and_then(|config| clean(config.provider.as_deref())),
            "MONITORING_URL" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.url.as_deref())),
            "MONITORING_SYSTEM_ID" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.system_id.as_deref())),
            "MONITORING_AUTH_TOKEN" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.auth_token.as_deref())),
            "MONITORING_IDENTITY" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.identity.as_deref())),
            "MONITORING_EMAIL" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.email.as_deref())),
            "MONITORING_PASSWORD" => self
                .monitoring
                .as_ref()
                .and_then(|config| clean(config.password.as_deref())),
            "CALDAV_URL" => self
                .calendar
                .as_ref()
                .and_then(|config| clean(config.url.as_deref())),
            "CALDAV_USERNAME" => self
                .calendar
                .as_ref()
                .and_then(|config| clean(config.username.as_deref())),
            "CALDAV_USER" => self
                .calendar
                .as_ref()
                .and_then(|config| clean(config.user.as_deref()))
                .or_else(|| {
                    self.calendar
                        .as_ref()
                        .and_then(|config| clean(config.username.as_deref()))
                }),
            "CALDAV_PASSWORD" => self
                .calendar
                .as_ref()
                .and_then(|config| clean(config.password.as_deref())),
            "CALDAV_DISPLAY_NAME" => self
                .calendar
                .as_ref()
                .and_then(|config| clean(config.display_name.as_deref())),
            "CALDAV_SYNC_INTERVAL" => self
                .calendar
                .as_ref()
                .and_then(|config| config.sync_interval_seconds)
                .map(|value| value.to_string()),
            _ => None,
        };

        structured.or_else(|| self.legacy_config_value(name))
    }

    fn legacy_config_value(&self, name: &str) -> Option<String> {
        yaml_value_to_string(self.legacy_env.get(name)?)
    }
}

pub fn config_value(name: &str) -> Option<String> {
    read_app_config()
        .ok()
        .and_then(|config| config.config_value(name))
}

pub fn app_config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(APP_CONFIG_DIR).join(APP_CONFIG_FILE))
}

pub fn read_app_config() -> Result<AppConfig, String> {
    let path = app_config_path()?;
    if path.exists() {
        return read_app_config_at(&path);
    }

    let config = app_config_from_legacy_dotenvs()?;
    if !config.is_empty() {
        write_app_config(&config)?;
    }

    Ok(config)
}

fn read_app_config_at(path: &Path) -> Result<AppConfig, String> {
    let contents =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    if contents.trim().is_empty() {
        return Ok(AppConfig::default());
    }

    serde_yaml::from_str::<AppConfig>(&contents)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn write_app_config(config: &AppConfig) -> Result<(), String> {
    let path = app_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let body = serde_yaml::to_string(config).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;

    Ok(())
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| format!("Could not resolve HOME for ~/{APP_CONFIG_DIR}/{APP_CONFIG_FILE}"))
}

fn clean(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn yaml_value_to_string(value: &serde_yaml::Value) -> Option<String> {
    match value {
        serde_yaml::Value::String(value) => clean(Some(value)),
        serde_yaml::Value::Number(value) => Some(value.to_string()),
        serde_yaml::Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn dotenv_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(current_dir) = std::env::current_dir() {
        for ancestor in current_dir.ancestors() {
            push_unique_path(&mut candidates, &mut seen, ancestor.join(".env"));
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    push_unique_path(&mut candidates, &mut seen, manifest_dir.join(".env"));

    if let Some(project_dir) = manifest_dir.parent() {
        push_unique_path(&mut candidates, &mut seen, project_dir.join(".env"));
    }

    candidates
}

fn push_unique_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if seen.insert(path.clone()) {
        paths.push(path);
    }
}

fn parse_dotenv(contents: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }

        values.insert(key.to_string(), unquote_dotenv_value(value.trim()));
    }

    values
}

fn unquote_dotenv_value(value: &str) -> String {
    if value.len() >= 2 {
        let quoted_with_single = value.starts_with('\'') && value.ends_with('\'');
        let quoted_with_double = value.starts_with('"') && value.ends_with('"');

        if quoted_with_single {
            return value[1..value.len() - 1].to_string();
        }

        if quoted_with_double {
            return value[1..value.len() - 1]
                .replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace("\\t", "\t")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
        }
    }

    value.to_string()
}

fn read_legacy_dotenv_values() -> HashMap<String, String> {
    let mut values = HashMap::new();

    for path in dotenv_candidates() {
        let Ok(contents) = fs::read_to_string(path) else {
            continue;
        };

        for (key, value) in parse_dotenv(&contents) {
            values.entry(key).or_insert(value);
        }
    }

    values
}

fn get_dotenv_value(values: &HashMap<String, String>, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| values.get(*name).and_then(|value| clean(Some(value))))
}

fn known_dotenv_keys() -> HashSet<&'static str> {
    HashSet::from([
        "BITCH_DASHBOARD_AUTH_PROVIDER",
        "BITCH_DASHBOARD_PROVIDER",
        "BITCH_DASHBOARD_SESSION_TOKEN",
        "BITCH_DASHBOARD_URL",
        "BITCH_DASHBOARD_USERNAME",
        "BITCH_DASHBOARD_PASSWORD",
        "CALDAV_DISPLAY_NAME",
        "CALDAV_PASSWORD",
        "CALDAV_SYNC_INTERVAL",
        "CALDAV_URL",
        "CALDAV_USER",
        "CALDAV_USERNAME",
        "HERMES_DASHBOARD_AUTH_PROVIDER",
        "HERMES_DASHBOARD_PROVIDER",
        "HERMES_DASHBOARD_SESSION_TOKEN",
        "HERMES_DASHBOARD_URL",
        "HERMES_DASHBOARD_USERNAME",
        "HERMES_DASHBOARD_PASSWORD",
        "MONITORING_AUTH_TOKEN",
        "MONITORING_EMAIL",
        "MONITORING_IDENTITY",
        "MONITORING_PASSWORD",
        "MONITORING_SYSTEM_ID",
        "MONITORING_URL",
    ])
}

fn app_config_from_legacy_dotenvs() -> Result<AppConfig, String> {
    let values = read_legacy_dotenv_values();
    Ok(app_config_from_dotenv_values(&values))
}

fn app_config_from_dotenv_values(values: &HashMap<String, String>) -> AppConfig {
    let connection = connection_config_from_dotenv_values(values);
    let hermes = hermes_config_from_dotenv_values(values);
    let monitoring = monitoring_config_from_dotenv_values(values);
    let calendar = calendar_config_from_dotenv_values(values);
    let known = known_dotenv_keys();
    let legacy_env = values
        .iter()
        .filter(|(key, _)| !known.contains(key.as_str()))
        .map(|(key, value)| (key.clone(), serde_yaml::Value::String(value.clone())))
        .collect();

    AppConfig {
        calendar,
        connection,
        hermes,
        monitoring,
        legacy_env,
    }
}

fn connection_config_from_dotenv_values(
    values: &HashMap<String, String>,
) -> Option<ConnectionConfig> {
    let url = get_dotenv_value(values, &["HERMES_DASHBOARD_URL", "BITCH_DASHBOARD_URL"]);
    let token = get_dotenv_value(
        values,
        &[
            "HERMES_DASHBOARD_SESSION_TOKEN",
            "BITCH_DASHBOARD_SESSION_TOKEN",
        ],
    );
    let username = get_dotenv_value(
        values,
        &["HERMES_DASHBOARD_USERNAME", "BITCH_DASHBOARD_USERNAME"],
    );
    let password = get_dotenv_value(
        values,
        &["HERMES_DASHBOARD_PASSWORD", "BITCH_DASHBOARD_PASSWORD"],
    );

    if url.is_none() && token.is_none() && (username.is_none() || password.is_none()) {
        return None;
    }

    let auth_mode = if token.is_some() || username.is_none() || password.is_none() {
        "token"
    } else {
        "session"
    };

    Some(ConnectionConfig {
        auth_mode: Some(auth_mode.to_string()),
        mode: Some("remote".to_string()),
        profiles: None,
        token,
        url,
    })
}

fn hermes_config_from_dotenv_values(values: &HashMap<String, String>) -> Option<HermesConfigFile> {
    let config = HermesConfigFile {
        auth_provider: get_dotenv_value(
            values,
            &[
                "HERMES_DASHBOARD_AUTH_PROVIDER",
                "BITCH_DASHBOARD_AUTH_PROVIDER",
            ],
        ),
        password: get_dotenv_value(
            values,
            &["HERMES_DASHBOARD_PASSWORD", "BITCH_DASHBOARD_PASSWORD"],
        ),
        provider: get_dotenv_value(
            values,
            &["HERMES_DASHBOARD_PROVIDER", "BITCH_DASHBOARD_PROVIDER"],
        ),
        username: get_dotenv_value(
            values,
            &["HERMES_DASHBOARD_USERNAME", "BITCH_DASHBOARD_USERNAME"],
        ),
    };

    if config.auth_provider.is_none()
        && config.password.is_none()
        && config.provider.is_none()
        && config.username.is_none()
    {
        None
    } else {
        Some(config)
    }
}

fn monitoring_config_from_dotenv_values(
    values: &HashMap<String, String>,
) -> Option<MonitoringConfigFile> {
    let config = MonitoringConfigFile {
        auth_token: get_dotenv_value(values, &["MONITORING_AUTH_TOKEN"]),
        email: get_dotenv_value(values, &["MONITORING_EMAIL"]),
        identity: get_dotenv_value(values, &["MONITORING_IDENTITY"]),
        password: get_dotenv_value(values, &["MONITORING_PASSWORD"]),
        system_id: get_dotenv_value(values, &["MONITORING_SYSTEM_ID"]),
        url: get_dotenv_value(values, &["MONITORING_URL"]),
    };

    if config.auth_token.is_none()
        && config.email.is_none()
        && config.identity.is_none()
        && config.password.is_none()
        && config.system_id.is_none()
        && config.url.is_none()
    {
        None
    } else {
        Some(config)
    }
}

fn calendar_config_from_dotenv_values(
    values: &HashMap<String, String>,
) -> Option<CalendarConfigFile> {
    let config = CalendarConfigFile {
        display_name: get_dotenv_value(values, &["CALDAV_DISPLAY_NAME"]),
        password: get_dotenv_value(values, &["CALDAV_PASSWORD"]),
        sync_interval_seconds: get_dotenv_value(values, &["CALDAV_SYNC_INTERVAL"])
            .and_then(|value| value.parse::<u64>().ok()),
        url: get_dotenv_value(values, &["CALDAV_URL"]),
        user: get_dotenv_value(values, &["CALDAV_USER"]),
        username: get_dotenv_value(values, &["CALDAV_USERNAME"]),
    };

    if config.display_name.is_none()
        && config.password.is_none()
        && config.sync_interval_seconds.is_none()
        && config.url.is_none()
        && config.user.is_none()
        && config.username.is_none()
    {
        None
    } else {
        Some(config)
    }
}

pub fn read_saved_connection_config() -> Result<Option<ConnectionConfig>, String> {
    Ok(read_app_config()?.connection)
}

pub fn save_connection_config_to_disk(config: &ConnectionConfig) -> Result<(), String> {
    let mut app_config = read_app_config()?;
    app_config.connection = Some(config.clone());
    write_app_config(&app_config)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_exported_and_quoted_dotenv_values() {
        let contents = r#"
            IGNORED=value
            export BITCH_TEST='quoted value'
            OTHER=after
            DOUBLE="line\nvalue"
        "#;
        let values = parse_dotenv(contents);

        assert_eq!(
            values.get("BITCH_TEST").map(String::as_str),
            Some("quoted value")
        );
        assert_eq!(
            values.get("DOUBLE").map(String::as_str),
            Some("line\nvalue")
        );
    }

    #[test]
    fn migrates_legacy_dotenv_values_to_structured_yaml_config() {
        let values = HashMap::from([
            (
                "HERMES_DASHBOARD_URL".to_string(),
                "http://127.0.0.1:9119".to_string(),
            ),
            (
                "HERMES_DASHBOARD_SESSION_TOKEN".to_string(),
                "session-token".to_string(),
            ),
            (
                "HERMES_DASHBOARD_USERNAME".to_string(),
                "operator".to_string(),
            ),
            (
                "HERMES_DASHBOARD_PASSWORD".to_string(),
                "secret".to_string(),
            ),
            (
                "MONITORING_URL".to_string(),
                "https://monitoring.example.test".to_string(),
            ),
            ("MONITORING_SYSTEM_ID".to_string(), "system_1".to_string()),
            (
                "MONITORING_AUTH_TOKEN".to_string(),
                "monitor-token".to_string(),
            ),
            (
                "CALDAV_URL".to_string(),
                "https://calendar.example.test/dav/user/".to_string(),
            ),
            ("CALDAV_USERNAME".to_string(), "calendar-user".to_string()),
            ("CALDAV_PASSWORD".to_string(), "calendar-secret".to_string()),
            ("CALDAV_SYNC_INTERVAL".to_string(), "60".to_string()),
            ("EXTRA_BITCH_FLAG".to_string(), "extra".to_string()),
        ]);

        let config = app_config_from_dotenv_values(&values);

        assert_eq!(
            config
                .connection
                .as_ref()
                .and_then(|config| config.url.as_deref()),
            Some("http://127.0.0.1:9119")
        );
        assert_eq!(
            config
                .connection
                .as_ref()
                .and_then(|config| config.token.as_deref()),
            Some("session-token")
        );
        assert_eq!(
            config
                .hermes
                .as_ref()
                .and_then(|config| config.username.as_deref()),
            Some("operator")
        );
        assert_eq!(
            config.config_value("MONITORING_SYSTEM_ID").as_deref(),
            Some("system_1")
        );
        assert_eq!(
            config.config_value("CALDAV_SYNC_INTERVAL").as_deref(),
            Some("60")
        );
        assert_eq!(
            config.config_value("EXTRA_BITCH_FLAG").as_deref(),
            Some("extra")
        );
    }

    #[test]
    fn resolves_structured_yaml_config_values() {
        let config = AppConfig {
            connection: Some(ConnectionConfig {
                auth_mode: Some("token".to_string()),
                mode: Some("remote".to_string()),
                profiles: None,
                token: Some("session-token".to_string()),
                url: Some("http://127.0.0.1:9119".to_string()),
            }),
            hermes: Some(HermesConfigFile {
                username: Some("operator".to_string()),
                password: Some("secret".to_string()),
                auth_provider: Some("basic".to_string()),
                provider: None,
            }),
            monitoring: Some(MonitoringConfigFile {
                url: Some("https://monitoring.example.test".to_string()),
                system_id: Some("system_1".to_string()),
                auth_token: Some("monitor-token".to_string()),
                email: None,
                identity: None,
                password: None,
            }),
            calendar: Some(CalendarConfigFile {
                display_name: Some("Ops".to_string()),
                password: Some("calendar-secret".to_string()),
                sync_interval_seconds: Some(60),
                url: Some("https://calendar.example.test/dav/user/".to_string()),
                user: None,
                username: Some("calendar-user".to_string()),
            }),
            legacy_env: HashMap::new(),
        };

        assert_eq!(
            config
                .config_value("HERMES_DASHBOARD_SESSION_TOKEN")
                .as_deref(),
            Some("session-token")
        );
        assert_eq!(
            config.config_value("MONITORING_SYSTEM_ID").as_deref(),
            Some("system_1")
        );
        assert_eq!(
            config.config_value("CALDAV_SYNC_INTERVAL").as_deref(),
            Some("60")
        );
    }

    #[test]
    fn accepts_legacy_env_style_top_level_yaml_keys() {
        let config = serde_yaml::from_str::<AppConfig>(
            r#"
HERMES_DASHBOARD_URL: http://127.0.0.1:9119
MONITORING_AUTH_TOKEN: monitor-token
CALDAV_SYNC_INTERVAL: 120
"#,
        )
        .unwrap();

        assert_eq!(
            config.config_value("HERMES_DASHBOARD_URL").as_deref(),
            Some("http://127.0.0.1:9119")
        );
        assert_eq!(
            config.config_value("MONITORING_AUTH_TOKEN").as_deref(),
            Some("monitor-token")
        );
        assert_eq!(
            config.config_value("CALDAV_SYNC_INTERVAL").as_deref(),
            Some("120")
        );
    }
}
