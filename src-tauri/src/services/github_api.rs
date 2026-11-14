use crate::models::github::{Calendar, ContributionWeek};
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{io::Read, time::Duration};

pub const SCOPE: &str = "read:user offline_access";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const QUERY: &str = "query { viewer { id login contributionsCollection { startedAt endedAt contributionCalendar { totalContributions weeks { contributionDays { date weekday contributionCount contributionLevel } } } } } }";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub access: String,
    pub refresh: Option<String>,
    pub expires_at: Option<u64>,
    pub refresh_expires_at: Option<u64>,
}
#[derive(Clone)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub expires_at: u64,
    pub interval: u64,
}
#[derive(Clone, Debug)]
pub enum Failure {
    Temporary(Option<u64>),
    Reconnect,
    Denied,
    Expired,
    Configuration,
    InvalidData,
    Storage,
}
pub enum Poll {
    Pending,
    SlowDown(u64),
    Authorized(Tokens),
}
pub trait GithubApi: Send + Sync {
    fn device(&self, client_id: &str, now: u64) -> Result<DeviceCode, Failure>;
    fn poll(&self, client_id: &str, device: &DeviceCode, now: u64) -> Result<Poll, Failure>;
    fn rotate(&self, client_id: &str, tokens: &Tokens, now: u64) -> Result<Tokens, Failure>;
    fn calendar(&self, tokens: &Tokens, now: u64) -> Result<Calendar, Failure>;
}
pub struct OfficialApi(Client);
impl OfficialApi {
    pub fn new() -> Result<Self, Failure> {
        Client::builder()
            .user_agent("Aura-Desktop/0.1")
            .timeout(Duration::from_secs(25))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map(Self)
            .map_err(|_| Failure::Configuration)
    }
    fn form(&self, url: &str, form: &[(&str, &str)], now: u64) -> Result<Value, Failure> {
        decode(
            self.0
                .post(url)
                .header("Accept", "application/json")
                .form(form)
                .send(),
            now,
        )
    }
}
fn decode(response: Result<Response, reqwest::Error>, now: u64) -> Result<Value, Failure> {
    let response = response.map_err(|_| Failure::Temporary(None))?;
    let status = response.status().as_u16();
    let retry = response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| retry_deadline(v, now));
    let reset = response
        .headers()
        .get("x-ratelimit-reset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    let limited = response
        .headers()
        .get("x-ratelimit-remaining")
        .is_some_and(|v| v == "0");
    if status == 429 || (status == 403 && (limited || retry.is_some())) {
        return Err(Failure::Temporary(Some(
            retry.unwrap_or(now + 60).max(reset.unwrap_or(0)),
        )));
    }
    if status == 401 {
        return Err(Failure::Reconnect);
    }
    if status >= 500 {
        return Err(Failure::Temporary(retry));
    }
    // Bound responses; never expose raw provider bodies or request errors.
    let mut bytes = Vec::new();
    response
        .take(1_048_577)
        .read_to_end(&mut bytes)
        .map_err(|_| Failure::Temporary(None))?;
    if bytes.len() > 1_048_576 {
        return Err(Failure::InvalidData);
    }
    let parsed = serde_json::from_slice::<Value>(&bytes);
    bytes.fill(0);
    let value = parsed.map_err(|_| Failure::InvalidData)?;
    let body_limited = value["message"]
        .as_str()
        .is_some_and(|s| s.to_ascii_lowercase().contains("rate limit"))
        || value["errors"]
            .as_array()
            .is_some_and(|errors| errors.iter().any(|e| e["type"] == "RATE_LIMITED"));
    if body_limited {
        return Err(Failure::Temporary(Some(
            retry.unwrap_or(now + 60).max(reset.unwrap_or(0)),
        )));
    }
    if !(200..300).contains(&status) {
        return Err(if status == 403 {
            Failure::Reconnect
        } else {
            Failure::Configuration
        });
    }
    Ok(value)
}
fn retry_deadline(value: &str, now: u64) -> Option<u64> {
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(now.saturating_add(seconds));
    }
    // GitHub may use the standard IMF-fixdate form of Retry-After.
    let fields: Vec<_> = value.split_ascii_whitespace().collect();
    if fields.len() != 6 || fields[5] != "GMT" {
        return None;
    }
    let year: u64 = fields[3].parse().ok()?;
    let month = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    .iter()
    .position(|m| *m == fields[2])?;
    let day: u64 = fields[1].parse().ok()?;
    if !(1970..=9999).contains(&year)
        || !valid_date(&format!("{year:04}-{:02}-{day:02}", month + 1))
    {
        return None;
    }
    let clock: Vec<u64> = fields[4]
        .split(':')
        .map(str::parse)
        .collect::<Result<_, _>>()
        .ok()?;
    if clock.len() != 3 || clock[0] > 23 || clock[1] > 59 || clock[2] > 59 {
        return None;
    }
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let lengths = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let prior = year - 1;
    let days = 365 * (year - 1970) + (prior / 4 - prior / 100 + prior / 400)
        - (1969 / 4 - 1969 / 100 + 1969 / 400)
        + lengths[..month].iter().sum::<u64>()
        + day
        - 1;
    Some((days * 86400 + clock[0] * 3600 + clock[1] * 60 + clock[2]).max(now))
}
pub fn tokens(value: &Value, now: u64) -> Result<Tokens, Failure> {
    if value["error"].is_string() {
        return Err(oauth_error(value));
    }
    let access = value["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(Failure::InvalidData)?;
    if !value["token_type"]
        .as_str()
        .is_some_and(|s| s.eq_ignore_ascii_case("bearer"))
    {
        return Err(Failure::InvalidData);
    }
    let scopes = value["scope"].as_str().unwrap_or("");
    if !scopes
        .split([',', ' '])
        .any(|s| s == "read:user" || s == "user")
    {
        return Err(Failure::Reconnect);
    }
    Ok(Tokens {
        access: access.into(),
        refresh: value["refresh_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(String::from),
        expires_at: value["expires_in"].as_u64().map(|s| now.saturating_add(s)),
        refresh_expires_at: value["refresh_token_expires_in"]
            .as_u64()
            .map(|s| now.saturating_add(s)),
    })
}
fn oauth_error(value: &Value) -> Failure {
    match value["error"].as_str().unwrap_or("") {
        "access_denied" => Failure::Denied,
        "expired_token" | "token_expired" => Failure::Expired,
        "bad_refresh_token" | "invalid_grant" => Failure::Reconnect,
        "temporarily_unavailable" | "server_error" => Failure::Temporary(None),
        _ => Failure::Configuration,
    }
}
impl GithubApi for OfficialApi {
    fn device(&self, client_id: &str, now: u64) -> Result<DeviceCode, Failure> {
        let v = self.form(
            "https://github.com/login/device/code",
            &[("client_id", client_id), ("scope", SCOPE)],
            now,
        )?;
        if v["error"].is_string() {
            return Err(oauth_error(&v));
        }
        if v["verification_uri"] != "https://github.com/login/device" {
            return Err(Failure::InvalidData);
        }
        Ok(DeviceCode {
            device_code: v["device_code"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or(Failure::InvalidData)?
                .into(),
            user_code: v["user_code"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 32)
                .ok_or(Failure::InvalidData)?
                .into(),
            expires_at: now.saturating_add(
                v["expires_in"]
                    .as_u64()
                    .filter(|s| *s > 0)
                    .ok_or(Failure::InvalidData)?,
            ),
            interval: v["interval"].as_u64().unwrap_or(5).max(1),
        })
    }
    fn poll(&self, client_id: &str, device: &DeviceCode, now: u64) -> Result<Poll, Failure> {
        let v = self.form(
            TOKEN_URL,
            &[
                ("client_id", client_id),
                ("device_code", &device.device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ],
            now,
        )?;
        match v["error"].as_str() {
            Some("authorization_pending") => Ok(Poll::Pending),
            Some("slow_down") => Ok(Poll::SlowDown(
                v["interval"]
                    .as_u64()
                    .unwrap_or(device.interval + 5)
                    .max(device.interval + 5),
            )),
            Some(_) => Err(oauth_error(&v)),
            None => tokens(&v, now).map(Poll::Authorized),
        }
    }
    fn rotate(&self, client_id: &str, old: &Tokens, now: u64) -> Result<Tokens, Failure> {
        if old.refresh_expires_at.is_some_and(|expiry| expiry <= now) {
            return Err(Failure::Reconnect);
        }
        let refresh = old.refresh.as_deref().ok_or(Failure::Reconnect)?;
        let v = self.form(
            TOKEN_URL,
            &[
                ("client_id", client_id),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh),
            ],
            now,
        )?;
        let result = tokens(&v, now)?;
        if result.refresh.is_none() {
            return Err(Failure::Reconnect);
        }
        Ok(result)
    }
    fn calendar(&self, tokens: &Tokens, now: u64) -> Result<Calendar, Failure> {
        let v = decode(
            self.0
                .post("https://api.github.com/graphql")
                .bearer_auth(&tokens.access)
                .header("Accept", "application/vnd.github+json")
                .json(&json!({"query": QUERY}))
                .send(),
            now,
        )?;
        parse_calendar(&v, now)
    }
}
pub fn parse_calendar(v: &Value, now: u64) -> Result<Calendar, Failure> {
    if let Some(errors) = v["errors"].as_array().filter(|e| !e.is_empty()) {
        if errors.iter().any(|e| e["type"] == "RATE_LIMITED") {
            return Err(Failure::Temporary(Some(now + 300)));
        }
        return Err(Failure::InvalidData);
    }
    let viewer = &v["data"]["viewer"];
    let account_id = viewer["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(Failure::InvalidData)?
        .to_owned();
    let login = viewer["login"]
        .as_str()
        .filter(|s| valid_login(s))
        .ok_or(Failure::InvalidData)?
        .to_owned();
    let collection = &viewer["contributionsCollection"];
    let from = collection["startedAt"]
        .as_str()
        .and_then(|s| s.get(..10))
        .filter(|s| valid_date(s))
        .ok_or(Failure::InvalidData)?;
    let to = collection["endedAt"]
        .as_str()
        .and_then(|s| s.get(..10))
        .filter(|s| valid_date(s))
        .ok_or(Failure::InvalidData)?;
    if from > to {
        return Err(Failure::InvalidData);
    }
    let calendar = &collection["contributionCalendar"];
    let total_contributions = calendar["totalContributions"]
        .as_u64()
        .and_then(|s| u32::try_from(s).ok())
        .ok_or(Failure::InvalidData)?;
    let mut weeks: Vec<ContributionWeek> =
        serde_json::from_value(calendar["weeks"].clone()).map_err(|_| Failure::InvalidData)?;
    let mut previous = String::new();
    let mut days = 0;
    if !(52..=54).contains(&weeks.len()) {
        return Err(Failure::InvalidData);
    }
    for week in &weeks {
        if week.contribution_days.is_empty() || week.contribution_days.len() > 7 {
            return Err(Failure::InvalidData);
        }
        for day in &week.contribution_days {
            if day.weekday > 6
                || !valid_date(&day.date)
                || day.date <= previous
                || !matches!(
                    day.contribution_level.as_str(),
                    "NONE"
                        | "FIRST_QUARTILE"
                        | "SECOND_QUARTILE"
                        | "THIRD_QUARTILE"
                        | "FOURTH_QUARTILE"
                )
            {
                return Err(Failure::InvalidData);
            }
            previous.clone_from(&day.date);
            days += 1;
        }
    }
    // GitHub may pad boundary weeks with days outside the collection period.
    if !(365..=378).contains(&days) {
        return Err(Failure::InvalidData);
    }
    for week in &mut weeks {
        week.contribution_days
            .retain(|d| d.date.as_str() >= from && d.date.as_str() <= to);
    }
    weeks.retain(|w| !w.contribution_days.is_empty());
    let visible_days: usize = weeks.iter().map(|w| w.contribution_days.len()).sum();
    // GitHub's year view is week-aligned: 53 full weeks can contain 371 days.
    // The collection period is authoritative; leap/boundary years can use 54 columns.
    if !(365..=378).contains(&visible_days) {
        return Err(Failure::InvalidData);
    }
    Ok(Calendar {
        account_id,
        login,
        total_contributions,
        weeks,
        updated_at: now,
    })
}
pub fn valid_login(s: &str) -> bool {
    !s.is_empty() && s.len() <= 39 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || !b
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let year: u32 = s[..4].parse().unwrap_or(0);
    let month: u32 = s[5..7].parse().unwrap_or(0);
    let day: u32 = s[8..].parse().unwrap_or(0);
    let max = match month {
        2 => {
            if year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400)) {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    year > 0 && day > 0 && day <= max
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires the account owner's explicitly approved live GitHub connection"]
    fn live_calendar_response_contract() {
        use super::super::github_vault::Vault;
        let directory = ["APPDATA", "LOCALAPPDATA"]
            .iter()
            .filter_map(|key| std::env::var(key).ok())
            .map(|p| std::path::PathBuf::from(p).join("com.projectaura.desktop"))
            .find(|p| p.join("github-account.bin").exists())
            .expect("No saved GitHub connection");
        let saved = Vault(Some(directory))
            .load(option_env!("AURA_GITHUB_CLIENT_ID").unwrap_or(""))
            .unwrap()
            .expect("No saved GitHub connection");
        let api = OfficialApi::new().unwrap();
        let v = decode(
            api.0
                .post("https://api.github.com/graphql")
                .bearer_auth(&saved.tokens.access)
                .header("Accept", "application/vnd.github+json")
                .json(&json!({"query": QUERY}))
                .send(),
            super::super::github::now(),
        )
        .unwrap();
        let collection = &v["data"]["viewer"]["contributionsCollection"];
        let calendar = &collection["contributionCalendar"];
        let weeks = calendar["weeks"].as_array();
        let days: Vec<_> = weeks
            .into_iter()
            .flatten()
            .flat_map(|w| w["contributionDays"].as_array().into_iter().flatten())
            .collect();
        // Structural metadata only. Never print credentials, account IDs or provider bodies.
        println!(
            "calendar contract: {}",
            json!({
                "viewerIdPresent": v["data"]["viewer"]["id"].is_string(),
                "loginPresent": v["data"]["viewer"]["login"].is_string(),
                "startedAt": collection["startedAt"], "endedAt": collection["endedAt"],
                "weeks": weeks.map(Vec::len), "days": days.len(),
                "firstDate": days.first().map(|d| &d["date"]), "lastDate": days.last().map(|d| &d["date"]),
                "totalCountIsInteger": calendar["totalContributions"].is_u64(),
                "missingDayFields": days.iter().filter(|d| !d["date"].is_string() || !d["weekday"].is_u64() || !d["contributionCount"].is_u64() || !d["contributionLevel"].is_string()).count(),
                "graphqlErrorTypes": v["errors"].as_array().map(|e| e.iter().map(|v| v["type"].clone()).collect::<Vec<_>>()),
                "deserializeWeeks": serde_json::from_value::<Vec<ContributionWeek>>(calendar["weeks"].clone()).err().map(|e| e.to_string()),
            })
        );
        assert!(
            parse_calendar(&v, 0).is_ok(),
            "The live contribution calendar does not match the parser contract"
        );
    }
    #[test]
    fn complete_weeks_are_trimmed_to_the_past_year_including_leap_day() {
        let mut weeks = Vec::new();
        let (mut year, mut month, mut day) = (2027, 12, 26);
        for _ in 0..54 {
            let mut days = Vec::new();
            for weekday in 0..7 {
                let date = format!("{year:04}-{month:02}-{day:02}");
                days.push(json!({"date":date, "weekday":weekday, "contributionCount":0, "contributionLevel":"NONE"}));
                day += 1;
                if !valid_date(&format!("{year:04}-{month:02}-{day:02}")) {
                    day = 1;
                    month += 1;
                    if month == 13 {
                        month = 1;
                        year += 1;
                    }
                }
            }
            weeks.push(json!({"contributionDays":days}));
        }
        let value = json!({"data":{"viewer":{"id":"U_fixture", "login":"octocat", "contributionsCollection":{"startedAt":"2028-01-01T00:00:00Z", "endedAt":"2029-01-01T00:00:00Z", "contributionCalendar":{"totalContributions":0,"weeks":weeks}}}}});
        let calendar = parse_calendar(&value, 0).unwrap();
        let days: Vec<_> = calendar
            .weeks
            .iter()
            .flat_map(|w| &w.contribution_days)
            .collect();
        assert_eq!(days.len(), 367);
        assert_eq!(days.first().unwrap().date, "2028-01-01");
        assert_eq!(days.last().unwrap().date, "2029-01-01");
        assert_eq!(calendar.weeks.len(), 54);
        let mut full_year = value.clone();
        let collection = &mut full_year["data"]["viewer"]["contributionsCollection"];
        collection["startedAt"] = json!("2027-12-26T00:00:00Z");
        collection["endedAt"] = json!("2028-12-30T23:59:59Z");
        collection["contributionCalendar"]["weeks"]
            .as_array_mut()
            .unwrap()
            .truncate(53);
        let aligned = parse_calendar(&full_year, 0).unwrap();
        assert_eq!(aligned.weeks.len(), 53);
        assert_eq!(
            aligned
                .weeks
                .iter()
                .map(|w| w.contribution_days.len())
                .sum::<usize>(),
            371
        );
    }
    #[test]
    fn expiration_scope_and_rotation_response_validation() {
        let t = tokens(&json!({"access_token":"access", "refresh_token":"refresh", "scope":"read:user", "token_type":"bearer", "expires_in":28800, "refresh_token_expires_in":15897600}), 1000).unwrap();
        assert_eq!(t.expires_at, Some(29800));
        assert_eq!(t.refresh_expires_at, Some(15898600));
        assert!(matches!(
            tokens(&json!({"error":"bad_refresh_token"}), 0),
            Err(Failure::Reconnect)
        ));
        assert!(tokens(
            &json!({"access_token":"access", "scope":"", "token_type":"bearer"}),
            0
        )
        .is_err());
        assert!(tokens(
            &json!({"access_token":"access", "scope":"read:user", "token_type":"unexpected"}),
            0
        )
        .is_err());
    }
    #[test]
    fn date_boundaries_and_profile_validation() {
        for date in ["2028-02-29", "2029-01-01", "2000-02-29"] {
            assert!(valid_date(date));
        }
        for date in [
            "2029-02-29",
            "1900-02-29",
            "2028-13-01",
            "2028-04-31",
            "2028-01-00",
            "2028-0é-1",
        ] {
            assert!(!valid_date(date));
        }
        for login in ["octocat", "test-user"] {
            assert!(valid_login(login));
        }
        for login in ["", "https://evil.example", "a/b", "a?b"] {
            assert!(!valid_login(login));
        }
    }
    #[test]
    fn partial_graphql_errors_are_not_zero_contributions() {
        assert!(matches!(
            parse_calendar(&json!({"errors":[{"type":"RATE_LIMITED"}]}), 100),
            Err(Failure::Temporary(Some(400)))
        ));
        assert!(parse_calendar(&json!({"data":{"viewer":null}}), 0).is_err());
        assert!(parse_calendar(&json!({"errors":[{"type":"FORBIDDEN"}],"data":{}}), 0).is_err());
    }
    #[test]
    fn retry_after_seconds_and_http_dates_are_respected() {
        assert_eq!(retry_deadline("120", 1000), Some(1120));
        assert_eq!(retry_deadline("Thu, 01 Jan 1970 00:01:00 GMT", 0), Some(60));
        assert_eq!(
            retry_deadline("Wed, 21 Oct 2015 07:28:00 GMT", 0),
            Some(1445412480)
        );
        assert_eq!(retry_deadline("Fri, 29 Feb 2029 00:00:00 GMT", 0), None);
    }
}
