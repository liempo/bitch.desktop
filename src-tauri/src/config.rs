use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

const APP_CONFIG_DIR: &str = "bitch";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileConfig {
    pub auth_mode: Option<String>,
    pub mode: Option<String>,
    pub token: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub auth_mode: Option<String>,
    pub mode: Option<String>,
    pub profiles: Option<HashMap<String, ConnectionProfileConfig>>,
    pub token: Option<String>,
    pub url: Option<String>,
}

pub fn config_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| dotenv_value(name))
}

fn dotenv_value(name: &str) -> Option<String> {
    for path in dotenv_candidates() {
        let Ok(contents) = fs::read_to_string(path) else {
            continue;
        };

        if let Some(value) = parse_dotenv_value(&contents, name) {
            return Some(value);
        }
    }

    None
}

fn dotenv_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        for ancestor in current_dir.ancestors() {
            candidates.push(ancestor.join(".env"));
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join(".env"));

    if let Some(project_dir) = manifest_dir.parent() {
        candidates.push(project_dir.join(".env"));
    }

    candidates
}

fn parse_dotenv_value(contents: &str, name: &str) -> Option<String> {
    for line in contents.lines() {
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        if key.trim() != name {
            continue;
        }

        let mut value = value.trim().to_string();

        if value.len() >= 2 {
            let quoted_with_single = value.starts_with('\'') && value.ends_with('\'');
            let quoted_with_double = value.starts_with('"') && value.ends_with('"');

            if quoted_with_single || quoted_with_double {
                value = value[1..value.len() - 1].to_string();
            }
        }

        return Some(value);
    }

    None
}

fn legacy_app_config_dir() -> String {
    [APP_CONFIG_DIR, "desktop"].join(".")
}

fn config_base_dir() -> Result<PathBuf, String> {
    if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
        return Ok(PathBuf::from(config_home));
    }

    if let Some(home) = std::env::var_os("HOME") {
        return Ok(PathBuf::from(home).join(".config"));
    }

    Err("Could not resolve a config directory for connection.json".to_string())
}

fn connection_config_path_for(app_dir: impl AsRef<Path>) -> Result<PathBuf, String> {
    Ok(config_base_dir()?.join(app_dir).join("connection.json"))
}

fn connection_config_path() -> Result<PathBuf, String> {
    connection_config_path_for(APP_CONFIG_DIR)
}

fn legacy_connection_config_path() -> Result<PathBuf, String> {
    connection_config_path_for(legacy_app_config_dir())
}

fn read_connection_config_at(path: &Path) -> Result<ConnectionConfig, String> {
    let contents =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

    serde_json::from_str::<ConnectionConfig>(&contents)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn remove_legacy_connection_config_file() {
    let Ok(legacy_path) = legacy_connection_config_path() else {
        return;
    };

    if legacy_path.exists() {
        let _ = fs::remove_file(&legacy_path);
    }

    if let Some(parent) = legacy_path.parent() {
        let _ = fs::remove_dir(parent);
    }
}

fn migrate_legacy_connection_config(legacy_path: &Path, path: &Path) -> Result<(), String> {
    if path.exists() || !legacy_path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    fs::copy(legacy_path, path).map_err(|e| {
        format!(
            "Failed to migrate connection config from {} to {}: {e}",
            legacy_path.display(),
            path.display()
        )
    })?;
    remove_legacy_connection_config_file();

    Ok(())
}

pub fn read_saved_connection_config() -> Result<Option<ConnectionConfig>, String> {
    let path = connection_config_path()?;

    if path.exists() {
        return read_connection_config_at(&path).map(Some);
    }

    let legacy_path = legacy_connection_config_path()?;

    if !legacy_path.exists() {
        return Ok(None);
    }

    let config = read_connection_config_at(&legacy_path)?;
    migrate_legacy_connection_config(&legacy_path, &path)?;

    Ok(Some(config))
}

pub fn save_connection_config_to_disk(config: &ConnectionConfig) -> Result<(), String> {
    let path = connection_config_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let body = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, format!("{body}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    remove_legacy_connection_config_file();

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
        "#;

        assert_eq!(
            parse_dotenv_value(contents, "BITCH_TEST").as_deref(),
            Some("quoted value")
        );
    }
}
