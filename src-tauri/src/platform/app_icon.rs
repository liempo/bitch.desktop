use crate::errors::AppResult;

const MAX_DYNAMIC_APP_ICON_BYTES: usize = 8 * 1024 * 1024;
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

pub fn validate_dynamic_app_icon_png(png_bytes: &[u8]) -> AppResult<()> {
    if png_bytes.is_empty() {
        return Err("dynamic app icon PNG data is empty".to_string());
    }

    if png_bytes.len() > MAX_DYNAMIC_APP_ICON_BYTES {
        return Err("dynamic app icon PNG data is too large".to_string());
    }

    if !png_bytes.starts_with(PNG_SIGNATURE) {
        return Err("dynamic app icon must be PNG data".to_string());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos_application_icon(app: &tauri::AppHandle, png_bytes: Option<Vec<u8>>) -> AppResult<()> {
    use std::sync::mpsc;

    if objc2::MainThreadMarker::new().is_some() {
        return set_macos_application_icon_on_main_thread(png_bytes.as_deref());
    }

    let (sender, receiver) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result = set_macos_application_icon_on_main_thread(png_bytes.as_deref());
        let _ = sender.send(result);
    })
    .map_err(|error| format!("could not schedule dynamic app icon update: {error}"))?;

    receiver
        .recv()
        .map_err(|_| "dynamic app icon update did not return a result".to_string())?
}

#[cfg(target_os = "macos")]
fn set_macos_application_icon_on_main_thread(png_bytes: Option<&[u8]>) -> AppResult<()> {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let mtm = MainThreadMarker::new()
        .ok_or_else(|| "dynamic app icon must be set from the macOS main thread".to_string())?;
    let app = NSApplication::sharedApplication(mtm);

    let image = match png_bytes {
        Some(bytes) => {
            let data = NSData::with_bytes(bytes);
            Some(
                NSImage::initWithData(NSImage::alloc(), &data).ok_or_else(|| {
                    "macOS could not decode dynamic app icon PNG data".to_string()
                })?,
            )
        }
        None => None,
    };

    unsafe {
        app.setApplicationIconImage(image.as_deref());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set_dynamic_app_icon(app: &tauri::AppHandle, png_bytes: Vec<u8>) -> AppResult<()> {
    validate_dynamic_app_icon_png(&png_bytes)?;
    set_macos_application_icon(app, Some(png_bytes))
}

#[cfg(not(target_os = "macos"))]
pub fn set_dynamic_app_icon(_app: &tauri::AppHandle, png_bytes: Vec<u8>) -> AppResult<()> {
    validate_dynamic_app_icon_png(&png_bytes)?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn reset_dynamic_app_icon(app: &tauri::AppHandle) -> AppResult<()> {
    set_macos_application_icon(app, None)
}

#[cfg(not(target_os = "macos"))]
pub fn reset_dynamic_app_icon(_app: &tauri::AppHandle) -> AppResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_png_signature_for_dynamic_app_icons() {
        let mut png = PNG_SIGNATURE.to_vec();
        png.extend_from_slice(b"payload");

        assert!(validate_dynamic_app_icon_png(&png).is_ok());
        assert!(validate_dynamic_app_icon_png(b"").is_err());
        assert!(validate_dynamic_app_icon_png(b"not-a-png").is_err());
    }

    #[test]
    fn rejects_oversized_dynamic_app_icons() {
        let mut png = PNG_SIGNATURE.to_vec();
        png.resize(MAX_DYNAMIC_APP_ICON_BYTES + 1, 0);

        assert!(validate_dynamic_app_icon_png(&png).is_err());
    }
}
