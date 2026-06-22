use std::time::Duration;

const HTTP_TIMEOUT_SECS: u64 = 15;

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

pub fn build_api_url(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

pub fn normalize_request_method(
    method: Option<String>,
    command: &str,
) -> Result<reqwest::Method, String> {
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
            "{command} only supports GET, POST, PUT, PATCH, and DELETE, got {other}"
        )),
    }
}

pub fn summarize_response_body(text: &str) -> String {
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
