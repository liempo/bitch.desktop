use serde::Serialize;
use std::collections::HashMap;

use crate::config::{
    config_value, read_saved_connection_config, ConnectionConfig, ConnectionProfileConfig,
};

const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:9119";

#[derive(Clone, Debug)]
pub struct GatewayConfig {
    pub auth_mode: String,
    pub base_url: String,
    pub token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConnection {
    pub auth_mode: String,
    pub base_url: String,
    pub profile: Option<String>,
}

pub fn normalize_gateway_url(raw_url: &str) -> Result<String, String> {
    let value = raw_url.trim();

    if value.is_empty() {
        return Err("Hermes dashboard URL is required".to_string());
    }

    let mut parsed = url::Url::parse(value).map_err(|e| format!("Invalid dashboard URL: {e}"))?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!(
            "Hermes dashboard URL must be http:// or https://, got {}",
            parsed.scheme()
        ));
    }

    parsed.set_fragment(None);
    parsed.set_query(None);

    let prefix = parsed.path().trim_end_matches('/').to_string();
    parsed.set_path(&prefix);

    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

fn normalize_auth_mode(auth_mode: Option<&str>) -> String {
    match auth_mode.unwrap_or("token").trim() {
        "oauth" => "oauth".to_string(),
        _ => "token".to_string(),
    }
}

pub fn connection_scope_key(profile: Option<&str>) -> Option<String> {
    let value = profile.unwrap_or_default().trim();

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub fn ws_profile_key(profile: Option<&str>) -> String {
    connection_scope_key(profile).unwrap_or_else(|| "default".to_string())
}

fn env_connection_config() -> ConnectionConfig {
    ConnectionConfig {
        auth_mode: Some("token".to_string()),
        mode: Some("remote".to_string()),
        profiles: None,
        token: config_value("HERMES_DASHBOARD_SESSION_TOKEN"),
        url: Some(
            config_value("HERMES_DASHBOARD_URL").unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string()),
        ),
    }
}

pub fn load_connection_config() -> Result<ConnectionConfig, String> {
    Ok(read_saved_connection_config()?.unwrap_or_else(env_connection_config))
}

fn profile_remote_override<'a>(
    config: &'a ConnectionConfig,
    profile: Option<&str>,
) -> Option<&'a ConnectionProfileConfig> {
    let key = connection_scope_key(profile)?;
    let entry = config.profiles.as_ref()?.get(&key)?;

    if entry.mode.as_deref() != Some("remote") {
        return None;
    }

    let url = entry.url.as_deref().unwrap_or_default().trim();
    if url.is_empty() {
        return None;
    }

    Some(entry)
}

pub fn resolve_gateway_config(profile: Option<&str>) -> Result<GatewayConfig, String> {
    let config = load_connection_config()?;
    let override_config = profile_remote_override(&config, profile);
    let raw_base_url = override_config
        .and_then(|entry| entry.url.as_deref())
        .or(config.url.as_deref())
        .unwrap_or(DEFAULT_GATEWAY_URL);
    let base_url = normalize_gateway_url(raw_base_url)?;
    let token = override_config
        .and_then(|entry| entry.token.as_ref())
        .or(config.token.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "HERMES_DASHBOARD_SESSION_TOKEN is not set in connection config, environment, or .env"
                .to_string()
        })?;
    let auth_mode = override_config
        .and_then(|entry| entry.auth_mode.as_deref())
        .or(config.auth_mode.as_deref());

    Ok(GatewayConfig {
        auth_mode: normalize_auth_mode(auth_mode),
        base_url,
        token,
    })
}

pub fn resolve_connection(profile: Option<&str>) -> Result<ResolvedConnection, String> {
    let key = connection_scope_key(profile);
    let config = resolve_gateway_config(key.as_deref())?;

    Ok(ResolvedConnection {
        auth_mode: config.auth_mode,
        base_url: config.base_url,
        profile: key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_remote_base_url() {
        assert_eq!(
            normalize_gateway_url("https://example.test:9121/root/?token=nope#frag").unwrap(),
            "https://example.test:9121/root"
        );
    }

    #[test]
    fn profile_override_requires_remote_mode_and_url() {
        let mut profiles = HashMap::new();
        profiles.insert(
            "crypto".to_string(),
            ConnectionProfileConfig {
                auth_mode: Some("token".to_string()),
                mode: Some("remote".to_string()),
                token: Some("profile-token".to_string()),
                url: Some("http://127.0.0.1:9121".to_string()),
            },
        );
        profiles.insert(
            "ignored".to_string(),
            ConnectionProfileConfig {
                auth_mode: None,
                mode: Some("local".to_string()),
                token: None,
                url: Some("http://127.0.0.1:9122".to_string()),
            },
        );
        let config = ConnectionConfig {
            auth_mode: Some("token".to_string()),
            mode: Some("remote".to_string()),
            profiles: Some(profiles),
            token: Some("global-token".to_string()),
            url: Some("http://127.0.0.1:9119".to_string()),
        };

        assert_eq!(
            profile_remote_override(&config, Some("crypto")).and_then(|entry| entry.url.as_deref()),
            Some("http://127.0.0.1:9121")
        );
        assert!(profile_remote_override(&config, Some("ignored")).is_none());
        assert!(profile_remote_override(&config, None).is_none());
    }

    #[test]
    fn connection_scope_key_trims_empty_profiles() {
        assert_eq!(
            connection_scope_key(Some("  crypto  ")).as_deref(),
            Some("crypto")
        );
        assert!(connection_scope_key(Some("   ")).is_none());
        assert!(connection_scope_key(None).is_none());
    }
}
