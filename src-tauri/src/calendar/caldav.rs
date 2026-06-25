use std::{collections::BTreeSet, time::Duration};

use chrono::{LocalResult, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rrule::RRuleSet;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::calendar::config::CalDavConfig;

const DAY_MILLIS: i64 = 86_400_000;

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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedCalendarSource {
    pub calendar_name: String,
    pub etag: Option<String>,
    pub ical: String,
    pub source_url: String,
}

#[derive(Clone, Debug)]
struct EventTemplate {
    all_day: bool,
    calendar_name: Option<String>,
    description: Option<String>,
    duration_millis: i64,
    location: Option<String>,
    source_url: Option<String>,
    title: String,
    uid: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DateTimeParts {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

#[derive(Clone, Debug)]
struct EventMoment {
    all_day: bool,
    millis: i64,
    parts: DateTimeParts,
    timezone: Option<Tz>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

impl Weekday {
    fn from_rrule_token(value: &str) -> Option<Self> {
        match value.trim().to_ascii_uppercase().as_str() {
            "MO" => Some(Self::Monday),
            "TU" => Some(Self::Tuesday),
            "WE" => Some(Self::Wednesday),
            "TH" => Some(Self::Thursday),
            "FR" => Some(Self::Friday),
            "SA" => Some(Self::Saturday),
            "SU" => Some(Self::Sunday),
            _ => None,
        }
    }

    fn index(self) -> i64 {
        match self {
            Self::Monday => 0,
            Self::Tuesday => 1,
            Self::Wednesday => 2,
            Self::Thursday => 3,
            Self::Friday => 4,
            Self::Saturday => 5,
            Self::Sunday => 6,
        }
    }
}

#[derive(Clone, Debug)]
struct RecurrenceRule {
    byday: Vec<Weekday>,
    bymonth: Vec<u32>,
    bymonthday: Vec<u32>,
    count: Option<usize>,
    freq: Frequency,
    interval: u32,
    until_millis: Option<i64>,
}

pub fn sync_calendar_sources_blocking(
    config: &CalDavConfig,
) -> Result<Vec<CachedCalendarSource>, String> {
    let base_url =
        Url::parse(&config.calendar_url).map_err(|e| format!("Invalid CalDAV URL: {e}"))?;
    let credentials =
        minicaldav::Credentials::Basic(config.username.clone(), config.password.clone());
    let agent = ureq::AgentBuilder::new()
        .timeout_read(Duration::from_secs(30))
        .timeout_write(Duration::from_secs(30))
        .build();

    let calendars_result = minicaldav::get_calendars(agent.clone(), &credentials, &base_url);
    let mut sources = match calendars_result {
        Ok(calendars) if !calendars.is_empty() => {
            let mut sources = Vec::new();
            for calendar in calendars {
                let calendar_name = calendar_display_name(calendar.name(), config.display_name.as_deref());
                let (calendar_events, _parse_errors) = minicaldav::get_events(agent.clone(), &credentials, &calendar)
                    .map_err(|e| format!("Could not load CalDAV calendar '{}': {e:?}", calendar.name()))?;
                sources.extend(calendar_events.iter().map(|event| cached_source_from_event(&calendar_name, event)));
            }
            sources
        }
        Ok(_) => load_direct_calendar_sources(agent, &credentials, &base_url, config)?,
        Err(discovery_error) => load_direct_calendar_sources(agent, &credentials, &base_url, config)
            .map_err(|direct_error| {
                format!(
                    "Could not discover CalDAV calendars ({discovery_error:?}) or load the configured URL directly ({direct_error})"
                )
            })?,
    };

    sources.sort_by(|left, right| {
        left.calendar_name
            .cmp(&right.calendar_name)
            .then_with(|| left.source_url.cmp(&right.source_url))
    });
    Ok(sources)
}

fn load_direct_calendar_sources(
    agent: ureq::Agent,
    credentials: &minicaldav::Credentials,
    base_url: &Url,
    config: &CalDavConfig,
) -> Result<Vec<CachedCalendarSource>, String> {
    let event_refs = minicaldav::caldav::get_events(agent, credentials, base_url, base_url)
        .map_err(|e| format!("Could not load CalDAV events from configured URL: {e:?}"))?;
    let calendar_name = config
        .display_name
        .clone()
        .unwrap_or_else(|| "Calendar".to_string());
    let mut sources = Vec::new();

    for event_ref in event_refs {
        let ical = minicaldav::parse_ical(&event_ref.data)
            .map_err(|e| format!("Could not parse CalDAV event {}: {e:?}", event_ref.url))?;
        let event = minicaldav::Event::new(event_ref.etag, event_ref.url, ical);
        sources.push(cached_source_from_event(&calendar_name, &event));
    }

    Ok(sources)
}

fn cached_source_from_event(
    calendar_name: &str,
    event: &minicaldav::Event,
) -> CachedCalendarSource {
    CachedCalendarSource {
        calendar_name: calendar_name.to_string(),
        etag: event.etag().cloned(),
        ical: event.ical().serialize(),
        source_url: event.url().to_string(),
    }
}

fn calendar_display_name(calendar_name: &str, fallback: Option<&str>) -> String {
    let calendar_name = calendar_name.trim();
    if calendar_name.is_empty() {
        fallback.unwrap_or("Calendar").to_string()
    } else {
        calendar_name.to_string()
    }
}

pub fn calendar_events_from_cached_sources(
    sources: &[CachedCalendarSource],
    range: &CalendarEventRange,
) -> Result<Vec<CalendarEvent>, String> {
    let mut events = Vec::new();

    for source in sources {
        let Ok(url) = Url::parse(&source.source_url) else {
            continue;
        };
        let Ok(ical) = minicaldav::parse_ical(&source.ical) else {
            continue;
        };
        let event = minicaldav::Event::new(source.etag.clone(), url, ical);
        events.extend(expand_recurring_event(&event, &source.calendar_name, range));
    }

    events.sort_by(compare_calendar_events);
    Ok(events)
}

#[cfg(test)]
fn normalize_minicaldav_events(
    calendar_name: &str,
    events: &[minicaldav::Event],
    range: &CalendarEventRange,
) -> Vec<CalendarEvent> {
    events
        .iter()
        .flat_map(|event| expand_recurring_event(event, calendar_name, range))
        .collect()
}

fn expand_recurring_event(
    event: &minicaldav::Event,
    calendar_name: &str,
    range: &CalendarEventRange,
) -> Vec<CalendarEvent> {
    let default_timezone = calendar_timezone(event);
    let Some(start_property) = event.property("DTSTART") else {
        return Vec::new();
    };
    let Some(start) = parse_property_moment(&start_property, default_timezone) else {
        return Vec::new();
    };
    let end = event
        .property("DTEND")
        .and_then(|property| parse_property_moment(&property, default_timezone));
    let duration_millis = end
        .as_ref()
        .map(|end| end.millis - start.millis)
        .filter(|duration| *duration > 0)
        .unwrap_or(if start.all_day { DAY_MILLIS } else { 1 });
    let template = EventTemplate {
        all_day: start.all_day,
        calendar_name: Some(calendar_name.to_string()),
        description: event
            .get("DESCRIPTION")
            .map(|value| unescape_ics_text(value)),
        duration_millis,
        location: event.get("LOCATION").map(|value| unescape_ics_text(value)),
        source_url: event
            .get("URL")
            .map(|value| unescape_ics_text(value))
            .or_else(|| Some(event.url().to_string())),
        title: event
            .get("SUMMARY")
            .map(|value| unescape_ics_text(value))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Untitled event".to_string()),
        uid: event
            .get("UID")
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| event.url().to_string()),
    };

    let rrule = event.get("RRULE").and_then(|value| parse_rrule(value));
    let exdates = excluded_occurrence_millis(event, start.timezone.or(default_timezone));
    let mut occurrence_starts = BTreeSet::new();

    if let Some(rule) = &rrule {
        let occurrence_candidates = if start.timezone.is_some() {
            basic_rrule_occurrence_starts(&start, rule, range)
        } else {
            rrule_crate_occurrence_starts(event, &start, duration_millis, range)
                .unwrap_or_else(|| basic_rrule_occurrence_starts(&start, rule, range))
        };
        occurrence_starts.extend(occurrence_candidates);
    } else {
        occurrence_starts.insert(start.millis);
    }
    occurrence_starts.extend(rdate_occurrence_millis(
        event,
        start.timezone.or(default_timezone),
    ));

    occurrence_starts
        .into_iter()
        .filter(|millis| !exdates.contains(millis))
        .map(|millis| calendar_event_for_occurrence(&template, millis, rrule.is_some()))
        .filter(|event| event_overlaps_range(event, range))
        .collect()
}

fn basic_rrule_occurrence_starts(
    start: &EventMoment,
    rule: &RecurrenceRule,
    range: &CalendarEventRange,
) -> Vec<i64> {
    let Some(range_end) = iso_millis(&range.end) else {
        return Vec::new();
    };
    let start_day =
        days_from_civil(start.parts.year, start.parts.month, start.parts.day) * DAY_MILLIS;
    let final_day = range_end.div_euclid(DAY_MILLIS) * DAY_MILLIS + DAY_MILLIS;
    let until_limit = rule.until_millis.unwrap_or(i64::MAX);
    let mut occurrences = Vec::new();
    let mut generated_count = 0usize;
    let mut candidate_day = start_day;

    while candidate_day <= final_day {
        let Some(candidate_parts) = parts_at_day_with_time(candidate_day, &start.parts) else {
            break;
        };
        let Some(candidate_millis) = millis_for_parts(candidate_parts, start.timezone) else {
            candidate_day += DAY_MILLIS;
            continue;
        };

        if candidate_millis >= start.millis
            && candidate_millis <= until_limit
            && recurrence_matches(rule, &start.parts, candidate_parts)
        {
            generated_count += 1;
            if rule.count.is_some_and(|count| generated_count > count) {
                break;
            }
            if candidate_millis < range_end {
                occurrences.push(candidate_millis);
            }
        }

        if candidate_millis > until_limit
            || rule.count.is_some_and(|count| generated_count >= count)
        {
            break;
        }
        candidate_day += DAY_MILLIS;
    }

    occurrences
}

fn rrule_crate_occurrence_starts(
    event: &minicaldav::Event,
    start: &EventMoment,
    duration_millis: i64,
    range: &CalendarEventRange,
) -> Option<Vec<i64>> {
    let rrule_set: RRuleSet = rrule_set_source(event, start)?.parse().ok()?;
    let range_start = iso_millis(&range.start)?;
    let range_end = iso_millis(&range.end)?;
    let after = rrule_datetime_from_millis(range_start.saturating_sub(duration_millis.max(1) + 1))?;
    let before = rrule_datetime_from_millis(range_end)?;
    let result = rrule_set.after(after).before(before).all(2_000);

    Some(
        result
            .dates
            .into_iter()
            .map(|occurrence| occurrence.timestamp_millis())
            .collect(),
    )
}

fn rrule_set_source(event: &minicaldav::Event, start: &EventMoment) -> Option<String> {
    let mut lines = vec![format!("DTSTART:{}", compact_timestamp(start.millis))];
    let mut has_recurrence_line = false;

    for (name, value) in event.properties() {
        if name.eq_ignore_ascii_case("RRULE") {
            has_recurrence_line = true;
            lines.push(format!("RRULE:{value}"));
        } else if name.eq_ignore_ascii_case("RDATE") {
            has_recurrence_line = true;
            lines.push(format!(
                "RDATE:{}",
                parse_ics_date_value_list(value, None)
                    .into_iter()
                    .map(compact_timestamp)
                    .collect::<Vec<_>>()
                    .join(",")
            ));
        } else if name.eq_ignore_ascii_case("EXDATE") {
            lines.push(format!(
                "EXDATE:{}",
                parse_ics_date_value_list(value, None)
                    .into_iter()
                    .map(compact_timestamp)
                    .collect::<Vec<_>>()
                    .join(",")
            ));
        }
    }

    if has_recurrence_line {
        Some(lines.join("\n"))
    } else {
        None
    }
}

fn rrule_datetime_from_millis(millis: i64) -> Option<chrono::DateTime<rrule::Tz>> {
    Some(
        Utc.timestamp_millis_opt(millis)
            .single()?
            .with_timezone(&rrule::Tz::UTC),
    )
}

fn recurrence_matches(
    rule: &RecurrenceRule,
    start: &DateTimeParts,
    candidate: DateTimeParts,
) -> bool {
    if !rule.bymonth.is_empty() && !rule.bymonth.contains(&candidate.month) {
        return false;
    }
    if !rule.bymonthday.is_empty() && !rule.bymonthday.contains(&candidate.day) {
        return false;
    }
    let candidate_weekday = weekday_for_date(candidate.year, candidate.month, candidate.day);
    if !rule.byday.is_empty() && !rule.byday.contains(&candidate_weekday) {
        return false;
    }

    let interval = i64::from(rule.interval.max(1));
    match rule.freq {
        Frequency::Daily => {
            let days = days_from_civil(candidate.year, candidate.month, candidate.day)
                - days_from_civil(start.year, start.month, start.day);
            days >= 0 && days % interval == 0
        }
        Frequency::Weekly => {
            let start_week = week_start_day_number(start.year, start.month, start.day);
            let candidate_week =
                week_start_day_number(candidate.year, candidate.month, candidate.day);
            let same_interval = (candidate_week - start_week) >= 0
                && ((candidate_week - start_week) / 7) % interval == 0;
            let day_matches = if rule.byday.is_empty() {
                candidate_weekday == weekday_for_date(start.year, start.month, start.day)
            } else {
                true
            };
            same_interval && day_matches
        }
        Frequency::Monthly => {
            let months = (candidate.year - start.year) as i64 * 12 + i64::from(candidate.month)
                - i64::from(start.month);
            let day_matches = if rule.bymonthday.is_empty() {
                candidate.day == start.day
            } else {
                true
            };
            months >= 0 && months % interval == 0 && day_matches
        }
        Frequency::Yearly => {
            let years = candidate.year - start.year;
            let month_matches = if rule.bymonth.is_empty() {
                candidate.month == start.month
            } else {
                true
            };
            let day_matches = if rule.bymonthday.is_empty() {
                candidate.day == start.day
            } else {
                true
            };
            years >= 0 && i64::from(years) % interval == 0 && month_matches && day_matches
        }
    }
}

fn parse_rrule(value: &str) -> Option<RecurrenceRule> {
    let mut freq = None;
    let mut interval = 1u32;
    let mut count = None;
    let mut until_millis = None;
    let mut byday = Vec::new();
    let mut bymonth = Vec::new();
    let mut bymonthday = Vec::new();

    for part in value.split(';') {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };
        match key.trim().to_ascii_uppercase().as_str() {
            "FREQ" => {
                freq = match value.trim().to_ascii_uppercase().as_str() {
                    "DAILY" => Some(Frequency::Daily),
                    "WEEKLY" => Some(Frequency::Weekly),
                    "MONTHLY" => Some(Frequency::Monthly),
                    "YEARLY" => Some(Frequency::Yearly),
                    _ => None,
                };
            }
            "INTERVAL" => interval = value.trim().parse::<u32>().unwrap_or(1).max(1),
            "COUNT" => count = value.trim().parse::<usize>().ok(),
            "UNTIL" => until_millis = parse_rrule_until(value.trim()),
            "BYDAY" => {
                byday = value
                    .split(',')
                    .filter_map(Weekday::from_rrule_token)
                    .collect();
            }
            "BYMONTH" => bymonth = parse_rrule_number_list(value, 1, 12),
            "BYMONTHDAY" => bymonthday = parse_rrule_number_list(value, 1, 31),
            _ => {}
        }
    }

    freq.map(|freq| RecurrenceRule {
        byday,
        bymonth,
        bymonthday,
        count,
        freq,
        interval,
        until_millis,
    })
}

fn parse_rrule_number_list(value: &str, min: u32, max: u32) -> Vec<u32> {
    value
        .split(',')
        .filter_map(|part| part.trim().parse::<u32>().ok())
        .filter(|value| (*value >= min) && (*value <= max))
        .collect()
}

fn parse_rrule_until(value: &str) -> Option<i64> {
    if value.contains('T') {
        parse_ics_datetime(value, false, None).map(|moment| moment.millis)
    } else {
        parse_ics_datetime(value, true, None).map(|moment| moment.millis + DAY_MILLIS - 1)
    }
}

fn event_datetime_properties(
    event: &minicaldav::Event,
    name: &str,
) -> Vec<minicaldav::ical::Property> {
    event
        .ical()
        .get("VEVENT")
        .map(|ical| {
            ical.properties
                .iter()
                .filter(|property| property.name.eq_ignore_ascii_case(name))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn calendar_timezone(event: &minicaldav::Event) -> Option<Tz> {
    event.ical().properties.iter().find_map(|property| {
        if property.name.eq_ignore_ascii_case("X-WR-TIMEZONE") {
            parse_timezone(&property.value)
        } else {
            None
        }
    })
}

fn parse_timezone(value: &str) -> Option<Tz> {
    value.trim().parse::<Tz>().ok()
}

fn attribute_case_insensitive<'a>(
    attributes: &'a std::collections::HashMap<String, String>,
    name: &str,
) -> Option<&'a String> {
    attributes
        .iter()
        .find_map(|(key, value)| key.eq_ignore_ascii_case(name).then_some(value))
}

fn attribute_case_insensitive_public<'a>(
    property: &'a minicaldav::Property,
    name: &str,
) -> Option<&'a String> {
    property
        .attribute(name)
        .or_else(|| property.attribute(&name.to_ascii_uppercase()))
        .or_else(|| property.attribute(&name.to_ascii_lowercase()))
}

fn value_is_date_only(value: &str) -> bool {
    !value.contains('T') && value.chars().filter(|ch| ch.is_ascii_digit()).count() == 8
}

fn property_is_all_day(value: &str, value_attribute: Option<&String>) -> bool {
    value_attribute.is_some_and(|value| value.eq_ignore_ascii_case("DATE"))
        || value_is_date_only(value)
}

fn timezone_from_attributes(attributes: &std::collections::HashMap<String, String>) -> Option<Tz> {
    attribute_case_insensitive(attributes, "TZID").and_then(|value| parse_timezone(value))
}

fn timezone_from_public_property(property: &minicaldav::Property) -> Option<Tz> {
    attribute_case_insensitive_public(property, "TZID").and_then(|value| parse_timezone(value))
}

fn value_has_utc_marker(value: &str) -> bool {
    value.trim().to_ascii_uppercase().ends_with('Z')
}

fn rdate_occurrence_millis(event: &minicaldav::Event, default_timezone: Option<Tz>) -> Vec<i64> {
    event_datetime_properties(event, "RDATE")
        .into_iter()
        .flat_map(|property| parse_ics_date_list(&property, default_timezone))
        .collect()
}

fn excluded_occurrence_millis(
    event: &minicaldav::Event,
    default_timezone: Option<Tz>,
) -> BTreeSet<i64> {
    event_datetime_properties(event, "EXDATE")
        .into_iter()
        .flat_map(|property| parse_ics_date_list(&property, default_timezone))
        .collect()
}

fn parse_ics_date_list(
    property: &minicaldav::ical::Property,
    default_timezone: Option<Tz>,
) -> Vec<i64> {
    let property_timezone = timezone_from_attributes(&property.attributes).or(default_timezone);
    let all_day = property_is_all_day(
        &property.value,
        attribute_case_insensitive(&property.attributes, "VALUE"),
    );

    property
        .value
        .split(',')
        .filter_map(|part| {
            parse_ics_datetime(
                part.trim(),
                all_day || !part.contains('T'),
                property_timezone,
            )
        })
        .map(|moment| moment.millis)
        .collect()
}

fn parse_ics_date_value_list(value: &str, timezone: Option<Tz>) -> Vec<i64> {
    value
        .split(',')
        .filter_map(|part| parse_ics_datetime(part.trim(), !part.contains('T'), timezone))
        .map(|moment| moment.millis)
        .collect()
}

fn parse_property_moment(
    property: &minicaldav::Property,
    default_timezone: Option<Tz>,
) -> Option<EventMoment> {
    let all_day = property_is_all_day(
        property.value(),
        attribute_case_insensitive_public(property, "VALUE"),
    );
    let timezone = timezone_from_public_property(property).or(default_timezone);
    parse_ics_datetime(property.value(), all_day, timezone)
}

fn parse_ics_datetime(value: &str, all_day: bool, timezone: Option<Tz>) -> Option<EventMoment> {
    let digits: String = value.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() < 8 {
        return None;
    }

    let year = digits.get(0..4)?.parse::<i32>().ok()?;
    let month = digits.get(4..6)?.parse::<u32>().ok()?;
    let day = digits.get(6..8)?.parse::<u32>().ok()?;
    let (hour, minute, second) = if all_day || digits.len() < 14 {
        (0, 0, 0)
    } else {
        (
            digits.get(8..10)?.parse::<u32>().ok()?,
            digits.get(10..12)?.parse::<u32>().ok()?,
            digits.get(12..14)?.parse::<u32>().ok()?,
        )
    };

    if !valid_date_time(year, month, day, hour, minute, second) {
        return None;
    }

    let parts = DateTimeParts {
        year,
        month,
        day,
        hour,
        minute,
        second,
    };
    let effective_timezone = if all_day || value_has_utc_marker(value) {
        None
    } else {
        timezone
    };

    Some(EventMoment {
        all_day,
        millis: millis_for_parts(parts, effective_timezone)?,
        parts,
        timezone: effective_timezone,
    })
}

fn calendar_event_for_occurrence(
    template: &EventTemplate,
    starts_at_millis: i64,
    recurring: bool,
) -> CalendarEvent {
    let ends_at_millis = starts_at_millis + template.duration_millis.max(1);
    CalendarEvent {
        all_day: template.all_day,
        calendar_name: template.calendar_name.clone(),
        description: template.description.clone(),
        ends_at: iso_from_millis(ends_at_millis),
        location: template.location.clone(),
        source_url: template.source_url.clone(),
        starts_at: iso_from_millis(starts_at_millis),
        title: template.title.clone(),
        uid: if recurring {
            format!("{}@{}", template.uid, compact_timestamp(starts_at_millis))
        } else {
            template.uid.clone()
        },
    }
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

fn compare_calendar_events(left: &CalendarEvent, right: &CalendarEvent) -> std::cmp::Ordering {
    left.all_day
        .cmp(&right.all_day)
        .reverse()
        .then_with(|| left.starts_at.cmp(&right.starts_at))
        .then_with(|| left.ends_at.cmp(&right.ends_at))
        .then_with(|| left.calendar_name.cmp(&right.calendar_name))
        .then_with(|| left.title.cmp(&right.title))
        .then_with(|| left.uid.cmp(&right.uid))
}

fn parts_at_day_with_time(day_millis: i64, time_source: &DateTimeParts) -> Option<DateTimeParts> {
    let days = day_millis.div_euclid(DAY_MILLIS);
    let (year, month, day) = civil_from_days(days)?;
    Some(DateTimeParts {
        year,
        month,
        day,
        hour: time_source.hour,
        minute: time_source.minute,
        second: time_source.second,
    })
}

fn iso_millis(value: &str) -> Option<i64> {
    parse_ics_datetime(value, value.len() == 10, None).map(|moment| moment.millis)
}

fn iso_from_millis(millis: i64) -> String {
    let days = millis.div_euclid(DAY_MILLIS);
    let day_millis = millis.rem_euclid(DAY_MILLIS);
    let (year, month, day) = civil_from_days(days).unwrap_or((1970, 1, 1));
    let total_seconds = day_millis / 1000;
    let hour = total_seconds / 3600;
    let minute = (total_seconds % 3600) / 60;
    let second = total_seconds % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn compact_timestamp(millis: i64) -> String {
    let iso = iso_from_millis(millis);
    let prefix = iso
        .split_once('.')
        .map(|(prefix, _)| prefix)
        .unwrap_or(&iso);
    format!("{}Z", prefix.replace(['-', ':'], ""))
}

fn millis_for_parts(parts: DateTimeParts, timezone: Option<Tz>) -> Option<i64> {
    let Some(timezone) = timezone else {
        return Some(utc_millis(parts));
    };
    let naive = NaiveDate::from_ymd_opt(parts.year, parts.month, parts.day)?.and_hms_opt(
        parts.hour,
        parts.minute,
        parts.second,
    )?;

    match timezone.from_local_datetime(&naive) {
        LocalResult::Single(datetime) => Some(datetime.with_timezone(&Utc).timestamp_millis()),
        LocalResult::Ambiguous(earliest, _) => {
            Some(earliest.with_timezone(&Utc).timestamp_millis())
        }
        LocalResult::None => None,
    }
}

fn utc_millis(parts: DateTimeParts) -> i64 {
    (days_from_civil(parts.year, parts.month, parts.day) * DAY_MILLIS)
        + i64::from(parts.hour * 3_600 + parts.minute * 60 + parts.second) * 1000
}

fn valid_date_time(year: i32, month: u32, day: u32, hour: u32, minute: u32, second: u32) -> bool {
    year >= 1
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day)
        && hour <= 23
        && minute <= 59
        && second <= 59
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let mut year = i64::from(year);
    let month = i64::from(month);
    let day = i64::from(day);
    year -= if month <= 2 { 1 } else { 0 };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> Option<(i32, u32, u32)> {
    let days = days + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36524 - day_of_era / 146096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };

    Some((
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    ))
}

fn week_start_day_number(year: i32, month: u32, day: u32) -> i64 {
    let day_number = days_from_civil(year, month, day);
    day_number - weekday_for_date(year, month, day).index()
}

fn weekday_for_date(year: i32, month: u32, day: u32) -> Weekday {
    match (days_from_civil(year, month, day) + 3).rem_euclid(7) {
        0 => Weekday::Monday,
        1 => Weekday::Tuesday,
        2 => Weekday::Wednesday,
        3 => Weekday::Thursday,
        4 => Weekday::Friday,
        5 => Weekday::Saturday,
        _ => Weekday::Sunday,
    }
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

fn unescape_ics_text(value: &str) -> String {
    value
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn range(start: &str, end: &str) -> CalendarEventRange {
        CalendarEventRange {
            end: end.to_string(),
            start: start.to_string(),
        }
    }

    fn event(uid: &str, summary: &str, start: &str, end: &str) -> minicaldav::Event {
        minicaldav::Event::builder(
            Url::parse(&format!("https://calendar.example.test/{uid}.ics")).unwrap(),
        )
        .uid(uid.to_string())
        .summary(summary.to_string())
        .start(start.to_string(), vec![])
        .end(end.to_string(), vec![])
        .build()
    }

    #[test]
    fn normalizes_events_from_multiple_calendars() {
        let ops = event(
            "ops-sync",
            "Ops sync",
            "20260625T160000Z",
            "20260625T163000Z",
        );
        let personal = event(
            "personal-call",
            "Personal call",
            "20260625T120000Z",
            "20260625T123000Z",
        );
        let range = range("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");

        let mut events = normalize_minicaldav_events("Ops", &[ops], &range);
        events.extend(normalize_minicaldav_events("Personal", &[personal], &range));
        events.sort_by(compare_calendar_events);

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].calendar_name.as_deref(), Some("Personal"));
        assert_eq!(events[1].calendar_name.as_deref(), Some("Ops"));
        assert_eq!(
            events[1].source_url.as_deref(),
            Some("https://calendar.example.test/ops-sync.ics")
        );
    }

    #[test]
    fn converts_tzid_wall_time_to_utc_instant_for_renderer_display() {
        let manila = minicaldav::Event::builder(
            Url::parse("https://calendar.example.test/manila.ics").unwrap(),
        )
        .uid("manila-call".to_string())
        .summary("Manila call".to_string())
        .start("20260625T090000".to_string(), vec![("TZID", "Asia/Manila")])
        .end("20260625T100000".to_string(), vec![("TZID", "Asia/Manila")])
        .build();
        let events = normalize_minicaldav_events(
            "Personal",
            &[manila],
            &range("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].starts_at, "2026-06-25T01:00:00.000Z");
        assert_eq!(events[0].ends_at, "2026-06-25T02:00:00.000Z");
    }

    #[test]
    fn uses_calendar_timezone_for_floating_datetimes() {
        let ical = minicaldav::parse_ical(
            r#"BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:Asia/Manila
BEGIN:VEVENT
UID:floating-call
SUMMARY:Floating call
DTSTART:20260625T090000
DTEND:20260625T100000
END:VEVENT
END:VCALENDAR"#,
        )
        .unwrap();
        let floating = minicaldav::Event::new(
            None,
            Url::parse("https://calendar.example.test/floating.ics").unwrap(),
            ical,
        );
        let events = normalize_minicaldav_events(
            "Personal",
            &[floating],
            &range("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].starts_at, "2026-06-25T01:00:00.000Z");
        assert_eq!(events[0].ends_at, "2026-06-25T02:00:00.000Z");
    }

    #[test]
    fn expands_timezone_rrules_at_the_same_local_wall_time() {
        let recurring = minicaldav::Event::builder(
            Url::parse("https://calendar.example.test/manila-weekly.ics").unwrap(),
        )
        .uid("manila-weekly".to_string())
        .summary("Manila weekly".to_string())
        .start("20260601T090000".to_string(), vec![("TZID", "Asia/Manila")])
        .end("20260601T100000".to_string(), vec![("TZID", "Asia/Manila")])
        .rrule(Some("FREQ=WEEKLY;COUNT=2;BYDAY=MO".to_string()))
        .build();
        let events = normalize_minicaldav_events(
            "Ops",
            &[recurring],
            &range("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
        );

        assert_eq!(
            events
                .iter()
                .map(|event| event.starts_at.as_str())
                .collect::<Vec<_>>(),
            vec!["2026-06-01T01:00:00.000Z", "2026-06-08T01:00:00.000Z"]
        );
    }

    #[test]
    fn expands_weekly_rrule_occurrences_inside_visible_range() {
        let recurring = minicaldav::Event::builder(
            Url::parse("https://calendar.example.test/weekly.ics").unwrap(),
        )
        .uid("weekly-sync".to_string())
        .summary("Weekly sync".to_string())
        .start("20260601T090000Z".to_string(), vec![])
        .end("20260601T100000Z".to_string(), vec![])
        .rrule(Some("FREQ=WEEKLY;COUNT=3;BYDAY=MO".to_string()))
        .build();
        let events = normalize_minicaldav_events(
            "Ops",
            &[recurring],
            &range("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
        );

        assert_eq!(
            events
                .iter()
                .map(|event| event.starts_at.as_str())
                .collect::<Vec<_>>(),
            vec![
                "2026-06-01T09:00:00.000Z",
                "2026-06-08T09:00:00.000Z",
                "2026-06-15T09:00:00.000Z",
            ]
        );
        assert_eq!(events[0].uid, "weekly-sync@20260601T090000Z");
    }

    #[test]
    fn respects_exdate_and_rdate_for_recurring_events() {
        let recurring = minicaldav::Event::builder(
            Url::parse("https://calendar.example.test/standup.ics").unwrap(),
        )
        .uid("standup".to_string())
        .summary("Standup".to_string())
        .start("20260601T090000Z".to_string(), vec![])
        .end("20260601T093000Z".to_string(), vec![])
        .rrule(Some("FREQ=DAILY;COUNT=3".to_string()))
        .generic("EXDATE".to_string(), "20260602T090000Z".to_string())
        .generic("RDATE".to_string(), "20260605T090000Z".to_string())
        .build();
        let events = normalize_minicaldav_events(
            "Ops",
            &[recurring],
            &range("2026-06-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z"),
        );

        assert_eq!(
            events
                .iter()
                .map(|event| event.starts_at.as_str())
                .collect::<Vec<_>>(),
            vec![
                "2026-06-01T09:00:00.000Z",
                "2026-06-03T09:00:00.000Z",
                "2026-06-05T09:00:00.000Z",
            ]
        );
    }

    #[test]
    fn keeps_annual_all_day_recurrences_in_later_visible_ranges() {
        let recurring = minicaldav::Event::builder(
            Url::parse("https://calendar.example.test/birthday.ics").unwrap(),
        )
        .uid("birthday".to_string())
        .summary("Birthday".to_string())
        .start("20080212".to_string(), vec![("VALUE", "DATE")])
        .end("20080213".to_string(), vec![("VALUE", "DATE")])
        .rrule(Some("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=12".to_string()))
        .build();
        let events = normalize_minicaldav_events(
            "Personal",
            &[recurring],
            &range("2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"),
        );

        assert_eq!(events.len(), 1);
        assert!(events[0].all_day);
        assert_eq!(events[0].starts_at, "2026-02-12T00:00:00.000Z");
        assert_eq!(events[0].ends_at, "2026-02-13T00:00:00.000Z");
    }

    #[test]
    fn converts_civil_dates_around_unix_epoch() {
        assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            iso_from_millis(1_782_777_600_000),
            "2026-06-30T00:00:00.000Z"
        );
        assert_eq!(weekday_for_date(2026, 6, 1), Weekday::Monday);
    }
}
