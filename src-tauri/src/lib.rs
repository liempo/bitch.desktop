const DEFAULT_GATEWAY_URL: &str = "https://homestation:9119";
const DEFAULT_STATUS_PATH: &str = "/api/status";
const AUTH_HEADER: &str = "X-Hermes-Session-Token";

#[tauri::command]
async fn check_connection() -> Result<(), String> {
    let gateway_url = std::env::var("BITCH_GATEWAY_URL").unwrap_or_else(|_| DEFAULT_GATEWAY_URL.to_string());
    let api_key = std::env::var("BITCH_DASHBOARD_API_KEY")
        .map_err(|_| "BITCH_DASHBOARD_API_KEY not set".to_string())?;

    let url = format!("{}{}", gateway_url.trim_end_matches('/'), DEFAULT_STATUS_PATH);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .header(AUTH_HEADER, api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("gateway returned {}", response.status()));
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_connection])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
