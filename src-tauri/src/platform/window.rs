const WINDOW_BAR_HEIGHT: f64 = 40.0;
const MACOS_TRAFFIC_LIGHT_SIZE: f64 = 12.0;
const MACOS_TRAFFIC_LIGHT_NATIVE_BOTTOM_INSET: f64 = 6.0;
const MACOS_TRAFFIC_LIGHT_X: f64 = 16.0;

fn macos_traffic_light_y() -> f64 {
    ((WINDOW_BAR_HEIGHT - MACOS_TRAFFIC_LIGHT_SIZE) / 2.0 + MACOS_TRAFFIC_LIGHT_NATIVE_BOTTOM_INSET)
        .max(0.0)
}

pub fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_macos_traffic_light_inset_from_window_bar_height() {
        assert_eq!(macos_traffic_light_y(), 20.0);
    }
}
