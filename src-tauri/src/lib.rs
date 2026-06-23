mod commands;
mod config;
mod errors;
mod hermes;
mod http;
mod monitoring;
mod platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_client = http::http_client().expect("failed to create HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(http_client)
        .setup(|app| {
            platform::window::create_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::get_connection_config,
            commands::config::save_connection_config,
            commands::config::resolve_connection,
            commands::dashboard::dashboard_request,
            commands::monitoring::monitoring_request,
            commands::gateway::connect_ws,
            commands::gateway::send_ws_message,
            commands::gateway::close_ws,
            commands::platform::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
