use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};
use tauri::Emitter;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

use crate::{
    hermes::{
        auth::{
            fetch_gateway_status, mint_ws_ticket, status_requires_ws_ticket, AUTH_HEADER,
            DEFAULT_WS_PATH,
        },
        config::{resolve_gateway_config, ws_profile_key, GatewayConfig},
    },
    http::http_client,
};

struct WsTarget {
    auth_header: Option<String>,
    url: String,
}

struct WsProxyState {
    connection_id: Option<String>,
    sender: Option<mpsc::UnboundedSender<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsOpenPayload {
    connection_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsMessagePayload {
    connection_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsErrorPayload {
    connection_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsClosePayload {
    connection_id: String,
    reason: String,
}

static WS_STATE: LazyLock<Mutex<HashMap<String, WsProxyState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn encode_query_value(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn build_ws_url(base_url: &str, query_name: &str, query_value: &str) -> Result<String, String> {
    let parsed = url::Url::parse(base_url).map_err(|e| format!("Invalid dashboard URL: {e}"))?;
    let scheme = if parsed.scheme() == "https" {
        "wss"
    } else {
        "ws"
    };
    let host = parsed
        .host()
        .ok_or_else(|| "Dashboard URL must include a host".to_string())?
        .to_string();
    let port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    let prefix = parsed.path().trim_end_matches('/');

    Ok(format!(
        "{scheme}://{host}{port}{prefix}{DEFAULT_WS_PATH}?{query_name}={}",
        encode_query_value(query_value)
    ))
}

fn redacted_ws_url(ws_url: &str) -> String {
    let Ok(mut parsed) = url::Url::parse(ws_url) else {
        return "<invalid ws url>".to_string();
    };

    let query_name = parsed
        .query_pairs()
        .find_map(|(name, _)| {
            let name = name.into_owned();

            if name == "token" || name == "ticket" {
                Some(name)
            } else {
                None
            }
        })
        .unwrap_or_else(|| "auth".to_string());

    parsed.set_query(None);

    format!("{}?{query_name}=<redacted>", parsed.as_str())
}

fn status_field<'a>(status: &'a serde_json::Value, field: &str) -> &'a str {
    status
        .get(field)
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown")
}

fn log_gateway(connection_id: &str, level: &str, message: impl Into<String>) {
    let message = message.into();
    eprintln!("[bitch][gateway][{connection_id}][{level}] {message}");
}

async fn resolve_ws_target(connection_id: &str, profile: Option<&str>) -> Result<WsTarget, String> {
    log_gateway(
        connection_id,
        "debug",
        format!(
            "resolving dashboard gateway config for profile={}",
            ws_profile_key(profile)
        ),
    );
    let config = resolve_gateway_config(profile).map_err(|error| {
        log_gateway(connection_id, "error", format!("config error: {error}"));
        error
    })?;

    log_gateway(
        connection_id,
        "debug",
        format!(
            "config resolved: base_url={} auth_mode={} token_present=true",
            config.base_url, config.auth_mode
        ),
    );

    let client = http_client().map_err(|error| {
        log_gateway(
            connection_id,
            "error",
            format!("HTTP client error: {error}"),
        );
        error
    })?;

    log_gateway(
        connection_id,
        "debug",
        "GET /api/status without auth header",
    );
    let (status, status_code) = fetch_gateway_status(&client, &config.base_url)
        .await
        .map_err(|error| {
            log_gateway(
                connection_id,
                "error",
                format!("status probe failed: {error}"),
            );
            error
        })?;
    let auth_required = status_requires_ws_ticket(&status);

    log_gateway(
        connection_id,
        "debug",
        format!(
            "status OK: http={} auth_required={} version={} gateway_state={}",
            status_code.as_u16(),
            auth_required,
            status_field(&status, "version"),
            status_field(&status, "gateway_state")
        ),
    );

    if auth_required {
        log_gateway(
            connection_id,
            "debug",
            "dashboard requires WS ticket auth; POST /api/auth/ws-ticket with session token header",
        );
        let ticket = mint_ws_ticket(&client, &config).await.map_err(|error| {
            let message = format!(
                "Gateway requires a dashboard WebSocket ticket, but ticket minting failed: {error}"
            );
            log_gateway(connection_id, "error", &message);
            message
        })?;
        let url = build_ws_url(&config.base_url, "ticket", &ticket).map_err(|error| {
            log_gateway(
                connection_id,
                "error",
                format!("WS URL build failed: {error}"),
            );
            error
        })?;

        log_gateway(
            connection_id,
            "debug",
            format!("WS ticket minted; target={}", redacted_ws_url(&url)),
        );

        return Ok(WsTarget {
            auth_header: None,
            url,
        });
    }

    let url = token_ws_target(&config).map_err(|error| {
        log_gateway(
            connection_id,
            "error",
            format!("WS URL build failed: {error}"),
        );
        error
    })?;

    log_gateway(
        connection_id,
        "debug",
        format!(
            "dashboard uses token auth; target={} header={} will be attached",
            redacted_ws_url(&url),
            AUTH_HEADER
        ),
    );

    Ok(WsTarget {
        auth_header: Some(config.token.clone()),
        url,
    })
}

fn token_ws_target(config: &GatewayConfig) -> Result<String, String> {
    build_ws_url(&config.base_url, "token", &config.token)
}

fn emit_ws_error(app: &tauri::AppHandle, connection_id: &str, message: String) {
    let _ = app.emit(
        "ws-error",
        WsErrorPayload {
            connection_id: connection_id.to_string(),
            message,
        },
    );
}

fn clear_ws_state(profile: &str, connection_id: &str) {
    let Ok(mut state) = WS_STATE.lock() else {
        return;
    };

    if state
        .get(profile)
        .and_then(|entry| entry.connection_id.as_deref())
        == Some(connection_id)
    {
        state.remove(profile);
    }
}

pub async fn connect_ws(
    app: tauri::AppHandle,
    connection_id: String,
    profile: Option<String>,
) -> Result<(), String> {
    let profile_key = ws_profile_key(profile.as_deref());
    log_gateway(
        &connection_id,
        "debug",
        format!("connect_ws command received for profile={profile_key}"),
    );
    let target = resolve_ws_target(&connection_id, Some(&profile_key)).await?;

    {
        let mut state = WS_STATE.lock().map_err(|e| e.to_string())?;
        state.insert(
            profile_key.clone(),
            WsProxyState {
                connection_id: Some(connection_id.clone()),
                sender: None,
            },
        );
    }
    log_gateway(
        &connection_id,
        "debug",
        "proxy state prepared; previous profile connection replaced if present",
    );

    let (tx, rx) = mpsc::unbounded_channel::<String>();

    {
        let mut state = WS_STATE.lock().map_err(|e| e.to_string())?;
        state
            .entry(profile_key.clone())
            .or_insert(WsProxyState {
                connection_id: Some(connection_id.clone()),
                sender: None,
            })
            .sender = Some(tx);
    }

    log_gateway(
        &connection_id,
        "debug",
        "spawning native WebSocket proxy task",
    );
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) =
            connect_and_listen(target, rx, app_clone.clone(), connection_id.clone()).await
        {
            emit_ws_error(&app_clone, &connection_id, error);
        }

        clear_ws_state(&profile_key, &connection_id);
    });

    Ok(())
}

async fn connect_and_listen(
    target: WsTarget,
    mut rx: mpsc::UnboundedReceiver<String>,
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<(), String> {
    log_gateway(
        &connection_id,
        "debug",
        format!(
            "building WebSocket upgrade request for {}",
            redacted_ws_url(&target.url)
        ),
    );
    let mut request = target.url.as_str().into_client_request().map_err(|e| {
        let message = format!("Failed to build WebSocket request: {e}");
        log_gateway(&connection_id, "error", &message);
        message
    })?;

    if let Some(token) = target.auth_header.as_deref() {
        log_gateway(
            &connection_id,
            "debug",
            format!("attaching {AUTH_HEADER} header to WebSocket upgrade"),
        );
        let token_header = HeaderValue::from_str(token).map_err(|e| {
            let message = format!("Failed to build {AUTH_HEADER} header: {e}");
            log_gateway(&connection_id, "error", &message);
            message
        })?;
        request.headers_mut().insert(AUTH_HEADER, token_header);
    } else {
        log_gateway(
            &connection_id,
            "debug",
            "no WebSocket auth header attached; using query ticket",
        );
    }

    log_gateway(&connection_id, "debug", "opening native WebSocket");
    let (ws_stream, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| {
            let message = format!("WebSocket connection failed: {e}");
            log_gateway(&connection_id, "error", &message);
            message
        })?;

    log_gateway(&connection_id, "info", "WebSocket upgrade succeeded");

    let _ = app.emit(
        "ws-open",
        WsOpenPayload {
            connection_id: connection_id.clone(),
        },
    );

    let (mut write, mut read) = ws_stream.split();

    let read_app = app.clone();
    let read_connection_id = connection_id.clone();
    let mut read_handle = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    log_gateway(
                        &read_connection_id,
                        "trace",
                        format!("received text frame: {} bytes", text.len()),
                    );
                    let _ = read_app.emit(
                        "ws-message",
                        WsMessagePayload {
                            connection_id: read_connection_id.clone(),
                            message: text.to_string(),
                        },
                    );
                }
                Ok(Message::Binary(data)) => {
                    log_gateway(
                        &read_connection_id,
                        "trace",
                        format!("received binary frame: {} bytes", data.len()),
                    );
                    let _ = read_app.emit(
                        "ws-message",
                        WsMessagePayload {
                            connection_id: read_connection_id.clone(),
                            message: String::from_utf8_lossy(&data).to_string(),
                        },
                    );
                }
                Ok(Message::Close(frame)) => {
                    let reason = frame
                        .map(|frame| frame.reason.to_string())
                        .filter(|reason| !reason.is_empty())
                        .unwrap_or_else(|| "server closed".to_string());
                    log_gateway(
                        &read_connection_id,
                        "warn",
                        format!("server closed WebSocket: {reason}"),
                    );
                    let _ = read_app.emit(
                        "ws-close",
                        WsClosePayload {
                            connection_id: read_connection_id.clone(),
                            reason,
                        },
                    );
                    break;
                }
                Err(e) => {
                    log_gateway(
                        &read_connection_id,
                        "error",
                        format!("WebSocket read error: {e}"),
                    );
                    let _ = read_app.emit(
                        "ws-error",
                        WsErrorPayload {
                            connection_id: read_connection_id.clone(),
                            message: format!("WebSocket error: {e}"),
                        },
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    loop {
        tokio::select! {
            maybe_msg = rx.recv() => {
                let Some(msg) = maybe_msg else {
                    break;
                };

                log_gateway(&connection_id,
                    "trace",
                    format!("sending text frame: {} bytes", msg.len()),
                );

                if let Err(e) = write.send(Message::Text(msg.into())).await {
                    log_gateway(&connection_id, "error", format!("WebSocket send error: {e}"));
                    let _ = app.emit(
                        "ws-error",
                        WsErrorPayload {
                            connection_id: connection_id.clone(),
                            message: format!("Send error: {e}"),
                        },
                    );
                    break;
                }
            }
            result = &mut read_handle => {
                if let Err(e) = result {
                    let _ = app.emit(
                        "ws-error",
                        WsErrorPayload {
                            connection_id: connection_id.clone(),
                            message: format!("WebSocket reader failed: {e}"),
                        },
                    );
                }
                break;
            }
        }
    }

    read_handle.abort();
    log_gateway(&connection_id, "debug", "native WebSocket proxy task ended");
    let _ = app.emit(
        "ws-close",
        WsClosePayload {
            connection_id,
            reason: "disconnected".to_string(),
        },
    );
    Ok(())
}

pub async fn send_ws_message(connection_id: String, message: String) -> Result<(), String> {
    let state = WS_STATE.lock().map_err(|e| e.to_string())?;
    let entry = state
        .values()
        .find(|entry| entry.connection_id.as_deref() == Some(connection_id.as_str()))
        .ok_or_else(|| {
            log_gateway(
                &connection_id,
                "warn",
                "refusing outbound frame for stale WebSocket connection",
            );
            "WebSocket connection is not current".to_string()
        })?;

    log_gateway(
        &connection_id,
        "trace",
        format!("renderer queued outbound frame: {} bytes", message.len()),
    );

    if let Some(ref sender) = entry.sender {
        sender
            .send(message)
            .map_err(|e| format!("Send failed: {e}"))
    } else {
        log_gateway(
            &connection_id,
            "error",
            "renderer attempted send but WebSocket proxy is not connected",
        );
        Err("WebSocket not connected".to_string())
    }
}

pub async fn close_ws(connection_id: String) -> Result<(), String> {
    log_gateway(&connection_id, "debug", "close_ws command received");
    let mut state = WS_STATE.lock().map_err(|e| e.to_string())?;
    let profile_key = state
        .iter()
        .find(|(_, entry)| entry.connection_id.as_deref() == Some(connection_id.as_str()))
        .map(|(profile, _)| profile.clone());

    if let Some(profile_key) = profile_key {
        state.remove(&profile_key);
        log_gateway(&connection_id, "debug", "proxy state cleared");
    } else {
        log_gateway(
            &connection_id,
            "debug",
            "close_ws ignored because connection is no longer current",
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_profile_aware_websocket_urls_with_redacted_auth() {
        let url = build_ws_url("https://example.test/root", "ticket", "ticket value").unwrap();

        assert_eq!(url, "wss://example.test/root/api/ws?ticket=ticket%20value");
        assert_eq!(
            redacted_ws_url(&url),
            "wss://example.test/root/api/ws?ticket=<redacted>"
        );
    }
}
