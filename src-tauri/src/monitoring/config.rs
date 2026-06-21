use crate::config::config_value;

const DEFAULT_MONITORING_URL: &str = "http://homestation:8090";

#[derive(Clone, Debug)]
pub struct HostMonitorConfig {
    pub auth: HostMonitorAuth,
    pub base_url: String,
}

#[derive(Clone, Debug)]
pub enum HostMonitorAuth {
    None,
    Password { identity: String, password: String },
    StaticToken(String),
}

fn configured_monitoring_url() -> String {
    config_value("MONITORING_URL")
        .or_else(|| config_value("HOST_MONITOR_URL"))
        .unwrap_or_else(|| DEFAULT_MONITORING_URL.to_string())
}

pub fn normalize_host_monitor_url(raw_url: &str) -> Result<String, String> {
    let value = raw_url.trim();

    if value.is_empty() {
        return Err("Beszel host monitor URL is required".to_string());
    }

    let mut parsed =
        url::Url::parse(value).map_err(|e| format!("Invalid Beszel host monitor URL: {e}"))?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!(
            "Beszel host monitor URL must be http:// or https://, got {}",
            parsed.scheme()
        ));
    }

    parsed.set_fragment(None);
    parsed.set_query(None);
    parsed.set_path("");

    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub fn resolve_host_monitor_config() -> Result<HostMonitorConfig, String> {
    let base_url = normalize_host_monitor_url(&configured_monitoring_url())?;
    let auth = if let Some(token) = config_value("MONITORING_AUTH_TOKEN") {
        HostMonitorAuth::StaticToken(token)
    } else if let (Some(identity), Some(password)) = (
        config_value("MONITORING_IDENTITY").or_else(|| config_value("MONITORING_EMAIL")),
        config_value("MONITORING_PASSWORD"),
    ) {
        HostMonitorAuth::Password { identity, password }
    } else {
        HostMonitorAuth::None
    };

    Ok(HostMonitorConfig { auth, base_url })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{LazyLock, Mutex};

    static TEST_ENV_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
    const MONITORING_ENV_KEYS: [&str; 6] = [
        "MONITORING_URL",
        "MONITORING_AUTH_TOKEN",
        "MONITORING_IDENTITY",
        "MONITORING_EMAIL",
        "MONITORING_PASSWORD",
        "HOST_MONITOR_URL",
    ];

    fn with_monitoring_env<R>(pairs: &[(&str, &str)], test: impl FnOnce() -> R) -> R {
        let _guard = TEST_ENV_LOCK.lock().unwrap();
        let previous: Vec<(&str, Option<String>)> = MONITORING_ENV_KEYS
            .iter()
            .map(|key| (*key, std::env::var(key).ok()))
            .collect();

        for key in MONITORING_ENV_KEYS {
            std::env::remove_var(key);
        }
        for (key, value) in pairs {
            std::env::set_var(key, value);
        }

        let result = test();

        for (key, value) in previous {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }

        result
    }

    #[test]
    fn normalizes_host_monitor_url_to_origin() {
        assert_eq!(
            normalize_host_monitor_url(
                "https://monitoring.example.test/system/el6ygn9w6w41w41?tab=cpu#chart"
            )
            .unwrap(),
            "https://monitoring.example.test"
        );
        assert_eq!(
            normalize_host_monitor_url("http://homestation:8090/").unwrap(),
            "http://homestation:8090"
        );
        assert!(normalize_host_monitor_url("ws://monitoring.example.test").is_err());
    }

    #[test]
    fn monitoring_url_precedes_host_monitor_url_compatibility_alias() {
        with_monitoring_env(
            &[
                (
                    "MONITORING_URL",
                    "https://monitoring.example.test/system/primary",
                ),
                (
                    "HOST_MONITOR_URL",
                    "https://legacy.example.test/system/legacy",
                ),
            ],
            || {
                let config = resolve_host_monitor_config().unwrap();

                assert_eq!(config.base_url, "https://monitoring.example.test");
            },
        );
    }

    #[test]
    fn host_monitor_url_alias_is_used_when_canonical_url_is_absent() {
        with_monitoring_env(
            &[(
                "HOST_MONITOR_URL",
                "https://legacy.example.test/system/legacy",
            )],
            || {
                let config = resolve_host_monitor_config().unwrap();

                assert_eq!(config.base_url, "https://legacy.example.test");
            },
        );
    }

    #[test]
    fn resolves_static_host_monitor_token_auth() {
        with_monitoring_env(
            &[
                (
                    "MONITORING_URL",
                    "https://monitoring.example.test/system/el6ygn9w6w41w41?tab=cpu",
                ),
                ("MONITORING_AUTH_TOKEN", " static-token "),
                ("MONITORING_EMAIL", "ignored@example.test"),
                ("MONITORING_PASSWORD", "ignored-password"),
            ],
            || {
                let config = resolve_host_monitor_config().unwrap();

                assert_eq!(config.base_url, "https://monitoring.example.test");
                match config.auth {
                    HostMonitorAuth::StaticToken(token) => assert_eq!(token, "static-token"),
                    other => panic!("expected static token auth, got {other:?}"),
                }
            },
        );
    }

    #[test]
    fn resolves_password_host_monitor_auth() {
        with_monitoring_env(
            &[
                ("MONITORING_URL", "http://homestation:8090/"),
                ("MONITORING_EMAIL", "beszel-user@example.test"),
                ("MONITORING_PASSWORD", " beszel-password "),
            ],
            || {
                let config = resolve_host_monitor_config().unwrap();

                assert_eq!(config.base_url, "http://homestation:8090");
                match config.auth {
                    HostMonitorAuth::Password { identity, password } => {
                        assert_eq!(identity, "beszel-user@example.test");
                        assert_eq!(password, "beszel-password");
                    }
                    other => panic!("expected password auth, got {other:?}"),
                }
            },
        );
    }
}
