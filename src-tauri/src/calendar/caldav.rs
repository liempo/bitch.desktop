use serde::{Deserialize, Serialize};

use crate::{calendar::config::CalDavConfig, http::summarize_response_body};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventRange {
    pub end: String,
    pub start: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub all_day: bool,
    pub calendar_name: Option<String>,
    pub description: Option<String>,
    pub ends_at: String,
    pub location: Option<String>,
    pub source_url: Option<String>,
    pub starts_at: String,
    pub title: String,
    pub uid: String,
}

fn caldav_timestamp(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let date_digits: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();

    if date_digits.len() < 8 {
        return Err(format!("Invalid calendar range timestamp: {value}"));
    }

    let date = &date_digits[..8];
    let time = if date_digits.len() >= 14 {
        &date_digits[8..14]
    } else {
        "000000"
    };

    Ok(format!("{date}T{time}Z"))
}

fn calendar_query_body(range: &CalendarEventRange) -> Result<String, String> {
    let start = caldav_timestamp(&range.start)?;
    let end = caldav_timestamp(&range.end)?;

    Ok(format!(
        r#"<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{start}" end="{end}" />
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"#
    ))
}

pub async fn list_calendar_events_impl(
    client: &reqwest::Client,
    config: &CalDavConfig,
    range: CalendarEventRange,
) -> Result<Vec<CalendarEvent>, String> {
    let method = reqwest::Method::from_bytes(b"REPORT").map_err(|e| e.to_string())?;
    let body = calendar_query_body(&range)?;
    let response = client
        .request(method, config.calendar_url.clone())
        .basic_auth(&config.username, Some(&config.password))
        .header("Accept", "application/xml, text/xml")
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Depth", "1")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "CalDAV request returned {status}: {}",
            summarize_response_body(&text)
        ));
    }

    let mut events = parse_calendar_events(&text, config.display_name.clone());
    events.retain(|event| event_overlaps_range(event, &range));
    events.sort_by(compare_calendar_events);

    Ok(events)
}

fn compare_calendar_events(left: &CalendarEvent, right: &CalendarEvent) -> std::cmp::Ordering {
    left.all_day
        .cmp(&right.all_day)
        .reverse()
        .then_with(|| left.starts_at.cmp(&right.starts_at))
        .then_with(|| left.ends_at.cmp(&right.ends_at))
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.uid.cmp(&right.uid))
}

fn event_overlaps_range(event: &CalendarEvent, range: &CalendarEventRange) -> bool {
    let Some(event_start) = iso_millis(&event.starts_at) else {
        return false;
    };
    let Some(event_end) = iso_millis(&event.ends_at).or(Some(event_start + 1)) else {
        return false;
    };
    let Some(range_start) = iso_millis(&range.start) else {
        return true;
    };
    let Some(range_end) = iso_millis(&range.end) else {
        return true;
    };

    event_start < range_end && event_end > range_start
}

fn iso_millis(value: &str) -> Option<i64> {
    let digits: String = value.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() < 8 {
        return None;
    }

    let year = digits.get(0..4)?.parse::<i32>().ok()?;
    let month = digits.get(4..6)?.parse::<u32>().ok()?;
    let day = digits.get(6..8)?.parse::<u32>().ok()?;
    let hour = digits.get(8..10).unwrap_or("00").parse::<u32>().ok()?;
    let minute = digits.get(10..12).unwrap_or("00").parse::<u32>().ok()?;
    let second = digits.get(12..14).unwrap_or("00").parse::<u32>().ok()?;

    Some(utc_seconds(year, month, day, hour, minute, second)? * 1000)
}

fn utc_seconds(
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> Option<i64> {
    if !(1..=12).contains(&month) || day < 1 || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    if day > days_in_month(year, month) {
        return None;
    }

    let mut days = 0i64;
    for current_year in 1970..year {
        days += if is_leap_year(current_year) { 366 } else { 365 };
    }
    for current_month in 1..month {
        days += i64::from(days_in_month(year, current_month));
    }
    days += i64::from(day - 1);

    Some(days * 86_400 + i64::from(hour * 3600 + minute * 60 + second))
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn decode_calendar_data(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some(inner) = trimmed
        .strip_prefix("<![CDATA[")
        .and_then(|value| value.strip_suffix("]]>"))
    {
        return inner.to_string();
    }

    xml_unescape(trimmed)
}

fn extract_calendar_data_entries(body: &str) -> Vec<String> {
    if body.contains("BEGIN:VEVENT") && !body.to_ascii_lowercase().contains("calendar-data") {
        return vec![body.to_string()];
    }

    let lower = body.to_ascii_lowercase();
    let mut entries = Vec::new();
    let mut offset = 0usize;

    while let Some(relative_name_pos) = lower[offset..].find("calendar-data") {
        let name_pos = offset + relative_name_pos;
        let Some(tag_start) = lower[..name_pos].rfind('<') else {
            offset = name_pos + "calendar-data".len();
            continue;
        };

        if lower[tag_start + 1..].starts_with('/') {
            offset = name_pos + "calendar-data".len();
            continue;
        }

        let Some(open_end_relative) = lower[name_pos..].find('>') else {
            break;
        };
        let open_end = name_pos + open_end_relative;
        let mut close_search = open_end + 1;
        let mut close_bounds = None;

        while let Some(relative_close_start) = lower[close_search..].find("</") {
            let close_start = close_search + relative_close_start;
            let Some(relative_close_end) = lower[close_start..].find('>') else {
                break;
            };
            let close_end = close_start + relative_close_end;
            if lower[close_start..close_end].contains("calendar-data") {
                close_bounds = Some((close_start, close_end + 1));
                break;
            }
            close_search = close_end + 1;
        }

        let Some((close_start, close_end)) = close_bounds else {
            offset = open_end + 1;
            continue;
        };

        entries.push(decode_calendar_data(&body[open_end + 1..close_start]));
        offset = close_end;
    }

    if entries.is_empty() && body.contains("BEGIN:VEVENT") {
        entries.push(body.to_string());
    }

    entries
}

pub fn parse_calendar_events(body: &str, calendar_name: Option<String>) -> Vec<CalendarEvent> {
    extract_calendar_data_entries(body)
        .into_iter()
        .flat_map(|entry| parse_ics_events(&entry, calendar_name.clone()))
        .collect()
}

fn parse_ics_events(ics: &str, calendar_name: Option<String>) -> Vec<CalendarEvent> {
    vevent_blocks(&unfold_ics_lines(ics))
        .into_iter()
        .filter_map(|lines| parse_vevent(&lines, calendar_name.clone()))
        .collect()
}

fn unfold_ics_lines(ics: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();

    for raw_line in ics.replace("\r\n", "\n").replace('\r', "\n").lines() {
        if raw_line.starts_with(' ') || raw_line.starts_with('\t') {
            if let Some(last) = lines.last_mut() {
                last.push_str(raw_line.trim_start());
            }
            continue;
        }

        lines.push(raw_line.to_string());
    }

    lines
}

fn vevent_blocks(lines: &[String]) -> Vec<Vec<String>> {
    let mut blocks = Vec::new();
    let mut current: Vec<String> = Vec::new();
    let mut in_event = false;

    for line in lines {
        let upper = line.to_ascii_uppercase();
        if upper == "BEGIN:VEVENT" {
            current.clear();
            in_event = true;
            continue;
        }

        if upper == "END:VEVENT" && in_event {
            blocks.push(current.clone());
            current.clear();
            in_event = false;
            continue;
        }

        if in_event {
            current.push(line.clone());
        }
    }

    blocks
}

fn property_value(lines: &[String], name: &str) -> Option<String> {
    for line in lines {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let Some(property_name) = key.split(';').next() else {
            continue;
        };
        if property_name.trim().eq_ignore_ascii_case(name) {
            return Some(unescape_ics_text(value.trim()));
        }
    }

    None
}

fn unescape_ics_text(value: &str) -> String {
    value
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

fn parse_vevent(lines: &[String], calendar_name: Option<String>) -> Option<CalendarEvent> {
    let uid = property_value(lines, "UID").unwrap_or_else(|| {
        property_value(lines, "DTSTART").unwrap_or_else(|| format!("event-{}", lines.len()))
    });
    let title = property_value(lines, "SUMMARY").unwrap_or_else(|| "Untitled event".to_string());
    let (starts_at, all_day) = parse_ics_datetime(&property_value(lines, "DTSTART")?)?;
    let ends_at = property_value(lines, "DTEND")
        .and_then(|value| parse_ics_datetime(&value).map(|(iso, _)| iso))
        .unwrap_or_else(|| {
            if all_day {
                next_day_iso(&starts_at)
            } else {
                starts_at.clone()
            }
        });

    Some(CalendarEvent {
        all_day,
        calendar_name,
        description: property_value(lines, "DESCRIPTION"),
        ends_at,
        location: property_value(lines, "LOCATION"),
        source_url: property_value(lines, "URL"),
        starts_at,
        title,
        uid,
    })
}

fn parse_ics_datetime(value: &str) -> Option<(String, bool)> {
    let trimmed = value.trim();
    let digits: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();

    if digits.len() == 8 && !trimmed.contains('T') {
        return Some((format_date_start(&digits), true));
    }

    if digits.len() < 14 {
        return None;
    }

    let date = &digits[..8];
    let time = &digits[8..14];
    Some((
        format!(
            "{}-{}-{}T{}:{}:{}.000Z",
            &date[0..4],
            &date[4..6],
            &date[6..8],
            &time[0..2],
            &time[2..4],
            &time[4..6]
        ),
        false,
    ))
}

fn format_date_start(date: &str) -> String {
    format!(
        "{}-{}-{}T00:00:00.000Z",
        &date[0..4],
        &date[4..6],
        &date[6..8]
    )
}

fn next_day_iso(iso: &str) -> String {
    let digits: String = iso.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() < 8 {
        return iso.to_string();
    }

    let Ok(year) = digits[0..4].parse::<i32>() else {
        return iso.to_string();
    };
    let Ok(month) = digits[4..6].parse::<u32>() else {
        return iso.to_string();
    };
    let Ok(day) = digits[6..8].parse::<u32>() else {
        return iso.to_string();
    };

    let mut next_year = year;
    let mut next_month = month;
    let mut next_day = day + 1;
    if next_day > days_in_month(year, month) {
        next_day = 1;
        next_month += 1;
    }
    if next_month > 12 {
        next_month = 1;
        next_year += 1;
    }

    format!("{next_year:04}-{next_month:02}-{next_day:02}T00:00:00.000Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_caldav_calendar_query_time_range() {
        let body = calendar_query_body(&CalendarEventRange {
            start: "2026-06-01T00:00:00.000Z".to_string(),
            end: "2026-07-01T00:00:00.000Z".to_string(),
        })
        .unwrap();

        assert!(body.contains("<C:calendar-query"));
        assert!(body.contains("start=\"20260601T000000Z\""));
        assert!(body.contains("end=\"20260701T000000Z\""));
    }

    #[test]
    fn parses_multistatus_calendar_data_into_events() {
        let xml = r#"
          <D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
            <D:response>
              <D:propstat><D:prop><C:calendar-data><![CDATA[
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:daily-sync
SUMMARY:Daily Sync
DTSTART:20260625T160000Z
DTEND:20260625T163000Z
LOCATION:Matrix room 7
DESCRIPTION:Standup bridge
END:VEVENT
BEGIN:VEVENT
UID:launch-window
SUMMARY:Launch Window
DTSTART;VALUE=DATE:20260625
DTEND;VALUE=DATE:20260626
END:VEVENT
END:VCALENDAR
              ]]></C:calendar-data></D:prop></D:propstat>
            </D:response>
          </D:multistatus>
        "#;

        let mut events = parse_calendar_events(xml, Some("Ops".to_string()));
        events.sort_by(compare_calendar_events);

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].uid, "launch-window");
        assert!(events[0].all_day);
        assert_eq!(events[0].starts_at, "2026-06-25T00:00:00.000Z");
        assert_eq!(events[0].ends_at, "2026-06-26T00:00:00.000Z");
        assert_eq!(events[1].uid, "daily-sync");
        assert_eq!(events[1].location.as_deref(), Some("Matrix room 7"));
        assert_eq!(events[1].calendar_name.as_deref(), Some("Ops"));
    }

    #[test]
    fn parses_escaped_calendar_data_without_xml_dependencies() {
        let xml = r#"<calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:escaped
SUMMARY:Escaped &amp; Reviewed
DTSTART:20260625T090000Z
END:VEVENT
END:VCALENDAR</calendar-data>"#;

        let events = parse_calendar_events(xml, None);

        assert_eq!(events[0].title, "Escaped & Reviewed");
        assert_eq!(events[0].ends_at, "2026-06-25T09:00:00.000Z");
    }
}
