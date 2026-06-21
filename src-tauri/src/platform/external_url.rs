use std::process::Command;

pub fn open_external_url(url: String) -> Result<(), String> {
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
