const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:9119";
const DEFAULT_STATUS_PATH: &str = "/api/status";
const DEFAULT_WS_PATH: &str = "/api/ws";
const WS_TICKET_PATH: &str = "/api/auth/ws-ticket";
const AUTH_HEADER: &str = "X-Hermes-Session-Token";
const HTTP_TIMEOUT_SECS: u64 = 15;
const APP_CONFIG_DIR: &str = "bitch";
const WINDOW_BAR_HEIGHT: f64 = 40.0;
const MACOS_TRAFFIC_LIGHT_SIZE: f64 = 12.0;
const MACOS_TRAFFIC_LIGHT_NATIVE_BOTTOM_INSET: f64 = 6.0;
const MACOS_TRAFFIC_LIGHT_X: f64 = 16.0;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{LazyLock, Mutex},
    time::Duration,
};
use tauri::Emitter;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

fn macos_traffic_light_y() -> f64 {
    ((WINDOW_BAR_HEIGHT - MACOS_TRAFFIC_LIGHT_SIZE) / 2.0 + MACOS_TRAFFIC_LIGHT_NATIVE_BOTTOM_INSET)
        .max(0.0)
}

fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    let builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("BITCH")
            .inner_size(1200.0, 800.0)
            .resizable(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(
            MACOS_TRAFFIC_LIGHT_X,
            macos_traffic_light_y(),
        ));

    builder.build().map(|_| ())
}

#[derive(Clone, Debug)]
struct GatewayConfig {
    auth_mode: String,
    base_url: String,
    token: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionProfileConfig {
    auth_mode: Option<String>,
    mode: Option<String>,
    token: Option<String>,
    url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionConfig {
    auth_mode: Option<String>,
    mode: Option<String>,
    profiles: Option<HashMap<String, ConnectionProfileConfig>>,
    token: Option<String>,
    url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedConnection {
    auth_mode: String,
    base_url: String,
    profile: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardRequest {
    body: Option<Value>,
    method: Option<String>,
    path: String,
    profile: Option<String>,
}

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

fn config_value(name: &str) -> Option<String> {
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

fn normalize_gateway_url(raw_url: &str) -> Result<String, String> {
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

fn connection_scope_key(profile: Option<&str>) -> Option<String> {
    let value = profile.unwrap_or_default().trim();

    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn ws_profile_key(profile: Option<&str>) -> String {
    connection_scope_key(profile).unwrap_or_else(|| "default".to_string())
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

fn read_saved_connection_config() -> Result<Option<ConnectionConfig>, String> {
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

fn env_connection_config() -> ConnectionConfig {
    ConnectionConfig {
        auth_mode: Some("token".to_string()),
        mode: Some("remote".to_string()),
        profiles: None,
        token: config_value("BITCH_DASHBOARD_API_KEY"),
        url: Some(
            config_value("VITE_HERMES_DASHBOARD_URL")
                .unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string()),
        ),
    }
}

fn load_connection_config() -> Result<ConnectionConfig, String> {
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

fn resolve_gateway_config(profile: Option<&str>) -> Result<GatewayConfig, String> {
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
            "BITCH_DASHBOARD_API_KEY is not set in connection config, environment, or .env"
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

fn encode_query_value(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn build_api_url(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
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

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

fn normalize_dashboard_method(method: Option<String>) -> Result<reqwest::Method, String> {
    let method = method
        .unwrap_or_else(|| "GET".to_string())
        .trim()
        .to_ascii_uppercase();

    match method.as_str() {
        "GET" => Ok(reqwest::Method::GET),
        "POST" => Ok(reqwest::Method::POST),
        "PUT" => Ok(reqwest::Method::PUT),
        "PATCH" => Ok(reqwest::Method::PATCH),
        "DELETE" => Ok(reqwest::Method::DELETE),
        other => Err(format!(
            "dashboard_request only supports GET, POST, PUT, PATCH, and DELETE, got {other}"
        )),
    }
}

fn validate_dashboard_path(path: &str) -> Result<&str, String> {
    let path = path.trim();

    if !path.starts_with("/api/") {
        return Err("dashboard_request path must start with /api/".to_string());
    }

    Ok(path)
}

async fn dashboard_request_impl(
    client: &reqwest::Client,
    config: &GatewayConfig,
    request: DashboardRequest,
) -> Result<Value, String> {
    let path = validate_dashboard_path(&request.path)?;
    let method = normalize_dashboard_method(request.method)?;
    let url = build_api_url(&config.base_url, path);

    let mut builder = client
        .request(method, url)
        .header(AUTH_HEADER, &config.token)
        .header("Accept", "application/json");

    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "dashboard request returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    if status == reqwest::StatusCode::NO_CONTENT || text.trim().is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str::<Value>(&text).map_err(|e| {
        format!(
            "dashboard request returned invalid JSON: {e}; body: {}",
            summarize_response_body(&text)
        )
    })
}

async fn fetch_gateway_status(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<(Value, reqwest::StatusCode), String> {
    let url = build_api_url(base_url, DEFAULT_STATUS_PATH);
    let response = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();

    if !status.is_success() {
        return Err(format!("gateway returned {status}"));
    }

    let body = response.json::<Value>().await.map_err(|e| e.to_string())?;

    Ok((body, status))
}

fn status_requires_ws_ticket(status: &Value) -> bool {
    status
        .get("auth_required")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn summarize_response_body(text: &str) -> String {
    let trimmed = text.trim();

    if trimmed.is_empty() {
        return "empty response".to_string();
    }

    let mut summary: String = trimmed.chars().take(240).collect();

    if trimmed.chars().count() > 240 {
        summary.push('…');
    }

    summary
}

async fn mint_ws_ticket(
    client: &reqwest::Client,
    config: &GatewayConfig,
) -> Result<String, String> {
    let url = build_api_url(&config.base_url, WS_TICKET_PATH);
    let response = client
        .post(url)
        .header(AUTH_HEADER, &config.token)
        .header("Accept", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "ws-ticket endpoint returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    let body = serde_json::from_str::<Value>(&text)
        .map_err(|e| format!("Invalid JSON from ws-ticket endpoint: {e}"))?;
    let ticket = body
        .get("ticket")
        .and_then(Value::as_str)
        .filter(|ticket| !ticket.is_empty())
        .ok_or_else(|| "Gateway did not return a WS ticket".to_string())?;

    Ok(ticket.to_string())
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

fn status_field<'a>(status: &'a Value, field: &str) -> &'a str {
    status
        .get(field)
        .and_then(Value::as_str)
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

    let url = build_ws_url(&config.base_url, "token", &config.token).map_err(|error| {
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

#[tauri::command]
async fn get_connection_config() -> Result<ConnectionConfig, String> {
    load_connection_config()
}

#[tauri::command]
async fn save_connection_config(config: ConnectionConfig) -> Result<ConnectionConfig, String> {
    let path = connection_config_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let body = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, format!("{body}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    remove_legacy_connection_config_file();

    Ok(config)
}

#[tauri::command]
async fn resolve_connection(profile: Option<String>) -> Result<ResolvedConnection, String> {
    let key = connection_scope_key(profile.as_deref());
    let config = resolve_gateway_config(key.as_deref())?;

    Ok(ResolvedConnection {
        auth_mode: config.auth_mode,
        base_url: config.base_url,
        profile: key,
    })
}

#[tauri::command]
async fn dashboard_request(
    client: tauri::State<'_, reqwest::Client>,
    request: DashboardRequest,
) -> Result<Value, String> {
    let profile = request.profile.clone();
    let config = resolve_gateway_config(profile.as_deref())?;
    dashboard_request_impl(&client, &config, request).await
}

#[tauri::command]
async fn connect_ws(
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

#[tauri::command]
async fn send_ws_message(connection_id: String, message: String) -> Result<(), String> {
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

#[tauri::command]
async fn close_ws(connection_id: String) -> Result<(), String> {
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

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    let url = external_browser_url(&url)?;
    open_url_in_browser(&url)
}

fn external_browser_url(raw_url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw_url.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        scheme => Err(format!("Unsupported external URL scheme: {scheme}")),
    }
}

#[cfg(target_os = "macos")]
fn open_url_in_browser(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open URL: {e}"))
}

#[cfg(target_os = "windows")]
fn open_url_in_browser(url: &str) -> Result<(), String> {
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open URL: {e}"))
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_url_in_browser(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open URL: {e}"))
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

    #[test]
    fn calculates_macos_traffic_light_inset_from_window_bar_height() {
        assert_eq!(macos_traffic_light_y(), 20.0);
    }

    #[test]
    fn external_browser_url_allows_http_and_https_only() {
        assert_eq!(
            external_browser_url(" https://example.test/docs?q=1 ").unwrap(),
            "https://example.test/docs?q=1"
        );
        assert_eq!(
            external_browser_url("http://example.test/").unwrap(),
            "http://example.test/"
        );
        assert!(external_browser_url("javascript:alert(1)").is_err());
        assert!(external_browser_url("file:///etc/passwd").is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_client = http_client().expect("failed to create HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(http_client)
        .setup(|app| {
            create_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_connection_config,
            save_connection_config,
            resolve_connection,
            dashboard_request,
            connect_ws,
            send_ws_message,
            close_ws,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
