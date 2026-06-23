use crate::config::config_value;

const DEFAULT_MONITORING_URL: &str = "http://homestation:8090";

#[derive(Clone, Debug)]
pub struct MonitoringConfig {
    pub auth: MonitoringAuth,
    pub base_url: String,
}

#[derive(Clone, Debug)]
pub enum MonitoringAuth {
    None,
    Password { identity: String, password: String },
    StaticToken(String),
}

fn configured_monitoring_url_from(get_value: &impl Fn(&str) -> Option<String>) -> String {
    get_value("MONITORING_URL").unwrap_or_else(|| DEFAULT_MONITORING_URL.to_string())
}

pub fn normalize_monitoring_url(raw_url: &str) -> Result<String, String> {
    let value = raw_url.trim();

    if value.is_empty() {
        return Err("Beszel monitoring URL is required".to_string());
    }

    let mut parsed =
        url::Url::parse(value).map_err(|e| format!("Invalid Beszel monitoring URL: {e}"))?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!(
            "Beszel monitoring URL must be http:// or https://, got {}",
            parsed.scheme()
        ));
    }

    parsed.set_fragment(None);
    parsed.set_query(None);
    parsed.set_path("");

    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub fn resolve_monitoring_config() -> Result<MonitoringConfig, String> {
    resolve_monitoring_config_from(config_value)
}

fn resolve_monitoring_config_from(
    get_value: impl Fn(&str) -> Option<String>,
) -> Result<MonitoringConfig, String> {
    let base_url = normalize_monitoring_url(&configured_monitoring_url_from(&get_value))?;
    let auth = if let Some(token) = get_value("MONITORING_AUTH_TOKEN") {
        MonitoringAuth::StaticToken(token)
    } else if let (Some(identity), Some(password)) = (
        get_value("MONITORING_IDENTITY").or_else(|| get_value("MONITORING_EMAIL")),
        get_value("MONITORING_PASSWORD"),
    ) {
        MonitoringAuth::Password { identity, password }
    } else {
        MonitoringAuth::None
    };

    Ok(MonitoringConfig { auth, base_url })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve_with_monitoring_values(pairs: &[(&str, &str)]) -> Result<MonitoringConfig, String> {
        resolve_monitoring_config_from(|name| {
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
    fn normalizes_monitoring_url_to_origin() {
        assert_eq!(
            normalize_monitoring_url(
                "https://monitoring.example.test/system/el6ygn9w6w41w41?tab=cpu#chart"
            )
            .unwrap(),
            "https://monitoring.example.test"
        );
        assert_eq!(
            normalize_monitoring_url("http://homestation:8090/").unwrap(),
            "http://homestation:8090"
        );
        assert!(normalize_monitoring_url("ws://monitoring.example.test").is_err());
    }

    #[test]
    fn resolves_monitoring_url_config() {
        let config = resolve_with_monitoring_values(&[(
            "MONITORING_URL",
            "https://monitoring.example.test/system/primary",
        )])
        .unwrap();

        assert_eq!(config.base_url, "https://monitoring.example.test");
    }

    #[test]
    fn defaults_monitoring_url_when_unset() {
        let config = resolve_with_monitoring_values(&[]).unwrap();

        assert_eq!(config.base_url, DEFAULT_MONITORING_URL);
    }

    #[test]
    fn resolves_static_monitoring_token_auth() {
        let config = resolve_with_monitoring_values(&[
            (
                "MONITORING_URL",
                "https://monitoring.example.test/system/el6ygn9w6w41w41?tab=cpu",
            ),
            ("MONITORING_AUTH_TOKEN", " static-token "),
            ("MONITORING_EMAIL", "ignored@example.test"),
            ("MONITORING_PASSWORD", "ignored-password"),
        ])
        .unwrap();

        assert_eq!(config.base_url, "https://monitoring.example.test");
        match config.auth {
            MonitoringAuth::StaticToken(token) => assert_eq!(token, "static-token"),
            other => panic!("expected static token auth, got {other:?}"),
        }
    }

    #[test]
    fn resolves_password_monitoring_auth() {
        let config = resolve_with_monitoring_values(&[
            ("MONITORING_URL", "http://homestation:8090/"),
            ("MONITORING_EMAIL", "beszel-user@example.test"),
            ("MONITORING_PASSWORD", " beszel-password "),
        ])
        .unwrap();

        assert_eq!(config.base_url, "http://homestation:8090");
        match config.auth {
            MonitoringAuth::Password { identity, password } => {
                assert_eq!(identity, "beszel-user@example.test");
                assert_eq!(password, "beszel-password");
            }
            other => panic!("expected password auth, got {other:?}"),
        }
    }
}
