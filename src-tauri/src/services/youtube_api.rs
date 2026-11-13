//! Official YouTube Data API only. Credentials never cross this native boundary.
use super::{music::valid_id, music_oauth, music_vault::SavedMusicCredentials};
use crate::models::{music::*, AppError};
use reqwest::Method;
use serde_json::{json, Value};
use std::{collections::HashMap, io::Read};

const BASE: &str = "https://www.googleapis.com/youtube/v3/";
const MAX_BODY: u64 = 2_097_152;
type Params = Vec<(&'static str, String)>;

pub trait Transport {
    fn request(
        &self,
        method: Method,
        route: &'static str,
        params: Params,
        body: Option<Value>,
    ) -> Result<Value, AppError>;
}

pub struct HttpTransport {
    client: reqwest::blocking::Client,
    access_token: String,
}

impl HttpTransport {
    pub fn new(access_token: String) -> Result<Self, AppError> {
        Ok(Self {
            client: music_oauth::http()?,
            access_token,
        })
    }

    fn prepare(
        &self,
        method: Method,
        route: &'static str,
        params: Params,
        body: Option<Value>,
    ) -> reqwest::blocking::RequestBuilder {
        let empty_body = body.is_none() && matches!(method, Method::POST | Method::DELETE);
        let mut request = self
            .client
            .request(method, format!("{BASE}{route}"))
            .bearer_auth(&self.access_token)
            .query(&params);
        if let Some(body) = body {
            request = request.json(&body);
        } else if empty_body {
            // Google's front end rejects a bodyless POST without this header
            // with HTTP 411. This sends no payload, as videos.rate requires.
            request = request.header(reqwest::header::CONTENT_LENGTH, "0");
        }
        request
    }
}

impl Transport for HttpTransport {
    fn request(
        &self,
        method: Method,
        route: &'static str,
        params: Params,
        body: Option<Value>,
    ) -> Result<Value, AppError> {
        // Callers select static routes; neither React nor provider responses can
        // supply an endpoint, redirect destination, or authorization header.
        let empty_success = (method == Method::POST && route == "videos/rate")
            || (method == Method::DELETE && route == "playlistItems");
        let request = self.prepare(method, route, params, body);
        let response = request.send().map_err(|_| AppError::new("OFFLINE", "Could not reach YouTube. Reload before retrying a change; it may have reached the service."))?;
        let status = response.status().as_u16();
        if empty_success && (200..300).contains(&status) && status != 204 {
            return Err(AppError::new("WRITE_UNCONFIRMED", "YouTube did not return the expected confirmation. Reload before retrying this change."));
        }
        let mut bytes = Vec::new();
        response
            .take(MAX_BODY + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| {
                AppError::new(
                    "OFFLINE",
                    "YouTube's response was interrupted. Reload before retrying changes.",
                )
            })?;
        if bytes.len() as u64 > MAX_BODY {
            return Err(response_error());
        }
        decode_response(status, &bytes)
    }
}

fn decode_response(status: u16, bytes: &[u8]) -> Result<Value, AppError> {
    if (200..300).contains(&status) {
        if status == 204 {
            return Ok(Value::Null);
        }
        return serde_json::from_slice(bytes).map_err(|_| response_error());
    }
    let value: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
    Err(api_error(status, &value))
}

fn api_error(status: u16, value: &Value) -> AppError {
    let raw = value
        .pointer("/error/errors/0/reason")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .pointer("/error/details/0/reason")
                .and_then(Value::as_str)
        })
        .unwrap_or("unknown");
    // Never include Google's raw messages, headers, URLs, or echoed parameters.
    let reason = match raw {
        "quotaExceeded"
        | "dailyLimitExceeded"
        | "rateLimitExceeded"
        | "userRateLimitExceeded"
        | "accessNotConfigured"
        | "SERVICE_DISABLED"
        | "insufficientPermissions"
        | "forbidden"
        | "youtubeSignupRequired"
        | "channelNotFound"
        | "playlistForbidden"
        | "playlistItemsNotAccessible"
        | "playlistOperationUnsupported"
        | "manualSortRequired"
        | "videoRatingDisabled"
        | "videoNotFound"
        | "playlistNotFound"
        | "playlistItemNotFound"
        | "invalidPageToken"
        | "authError"
        | "invalidCredentials"
        | "backendError" => raw,
        _ => "unknown",
    };
    let (code, message) = match reason {
        "quotaExceeded" | "dailyLimitExceeded" => ("YOUTUBE_QUOTA", "Aura's YouTube API quota is exhausted. Try again after the quota resets."),
        "rateLimitExceeded" | "userRateLimitExceeded" => ("YOUTUBE_RATE_LIMIT", "YouTube is limiting requests. Wait before retrying."),
        "accessNotConfigured" | "SERVICE_DISABLED" => ("YOUTUBE_API_DISABLED", "The YouTube Data API is not enabled for Aura's Google project. The developer must enable it before connecting."),
        "youtubeSignupRequired" | "channelNotFound" => ("NO_YOUTUBE_CHANNEL", "Create or select a YouTube channel in your browser, then reconnect Aura."),
        "insufficientPermissions" => ("YOUTUBE_PERMISSION", "Google did not grant the required YouTube permission. Reconnect and review the consent request."),
        "manualSortRequired" => ("PLAYLIST_SORT_REQUIRED", "Set this playlist's ordering to Manual on YouTube, then reload before moving entries."),
        "playlistOperationUnsupported" => ("PLAYLIST_READ_ONLY", "YouTube does not allow this playlist to be edited."),
        "videoRatingDisabled" => ("RATING_DISABLED", "YouTube does not allow this video to be rated."),
        "invalidPageToken" => ("PAGE_EXPIRED", "This result page expired. Reload the view."),
        _ if status == 401 => ("SESSION_EXPIRED", "Your YouTube session expired. Reconnect your account."),
        _ if status == 403 => ("YOUTUBE_FORBIDDEN", "YouTube denied this operation. Check your account's permission and reload before retrying changes."),
        _ if status == 404 => ("ITEM_UNAVAILABLE", "This YouTube item is no longer available. Reload the view."),
        _ => ("YOUTUBE_API_ERROR", "YouTube could not complete this request. Reload before retrying changes."),
    };
    let mut error = AppError::new(code, message);
    error.http_status = Some(status);
    error.provider_reason = Some(reason.to_owned());
    error
}

fn response_error() -> AppError {
    AppError::new(
        "PROVIDER_RESPONSE",
        "YouTube returned a response Aura could not verify.",
    )
}
fn invalid() -> AppError {
    AppError::new("INVALID_INPUT", "Check the YouTube details and try again.")
}
fn read_only() -> AppError {
    AppError::new(
        "PLAYLIST_READ_ONLY",
        "This playlist is not editable by your YouTube channel.",
    )
}
fn id(value: &str, video: bool) -> Result<(), AppError> {
    if valid_id(value, video) {
        Ok(())
    } else {
        Err(invalid())
    }
}
fn items(value: &Value) -> Result<&Vec<Value>, AppError> {
    value["items"].as_array().ok_or_else(response_error)
}
fn text(value: &Value) -> String {
    value.as_str().unwrap_or("").chars().take(500).collect()
}
fn title(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > 150
        || value
            .chars()
            .any(|c| c.is_control() || c == '<' || c == '>')
    {
        return Err(invalid());
    }
    Ok(value.into())
}
fn pagination(params: &mut Params, token: Option<String>) -> Result<(), AppError> {
    params.push(("maxResults", "25".into()));
    if let Some(token) = token {
        if token.is_empty() || token.len() > 2048 || token.chars().any(char::is_control) {
            return Err(invalid());
        }
        params.push(("pageToken", token));
    }
    Ok(())
}
fn next(value: &Value) -> Result<Option<String>, AppError> {
    match value.get("nextPageToken") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(token)) if !token.is_empty() && token.len() <= 2048 => {
            Ok(Some(token.clone()))
        }
        _ => Err(response_error()),
    }
}
fn thumbnail(snippet: &Value) -> Option<String> {
    ["medium", "default", "high"].iter().find_map(|size| {
        let url = snippet["thumbnails"][size]["url"].as_str()?;
        let parsed = url::Url::parse(url).ok()?;
        (parsed.scheme() == "https"
            && matches!(
                parsed.host_str(),
                Some(
                    "i.ytimg.com"
                        | "img.youtube.com"
                        | "yt3.ggpht.com"
                        | "lh3.googleusercontent.com"
                )
            )
            && parsed.username().is_empty()
            && parsed.password().is_none()
            && parsed.port().is_none())
        .then(|| url.to_owned())
    })
}
fn duration(value: &str) -> Option<String> {
    let mut number = String::new();
    let mut seconds = 0u64;
    if !value.starts_with('P') {
        return None;
    }
    for c in value.chars().skip(1) {
        if c.is_ascii_digit() {
            number.push(c);
            continue;
        }
        if c == 'T' {
            continue;
        }
        let multiplier = match c {
            'D' => 86400,
            'H' => 3600,
            'M' => 60,
            'S' => 1,
            _ => return None,
        };
        seconds = seconds.checked_add(number.parse::<u64>().ok()?.checked_mul(multiplier)?)?;
        number.clear();
    }
    if !number.is_empty() {
        return None;
    }
    Some(if seconds >= 3600 {
        format!(
            "{}:{:02}:{:02}",
            seconds / 3600,
            seconds / 60 % 60,
            seconds % 60
        )
    } else {
        format!("{}:{:02}", seconds / 60, seconds % 60)
    })
}

pub struct Channel {
    pub id: String,
    pub title: String,
    pub system_playlist_ids: Vec<String>,
}

pub struct YoutubeApi<'a> {
    pub transport: &'a dyn Transport,
}
impl YoutubeApi<'_> {
    fn get(&self, route: &'static str, params: Params) -> Result<Value, AppError> {
        self.transport.request(Method::GET, route, params, None)
    }
    pub fn account(&self) -> Result<Channel, AppError> {
        let response = self.get(
            "channels",
            vec![
                ("part", "snippet,contentDetails".into()),
                ("mine", "true".into()),
            ],
        )?;
        let channels = items(&response)?;
        if channels.is_empty() {
            return Err(AppError::new(
                "NO_YOUTUBE_CHANNEL",
                "Create or select a YouTube channel in your browser, then reconnect Aura.",
            ));
        }
        if channels.len() != 1 {
            return Err(AppError::new(
                "ACCOUNT_AMBIGUOUS",
                "Reconnect with the single YouTube channel you want Aura to use.",
            ));
        }
        let row = &channels[0];
        let channel_id = row["id"].as_str().ok_or_else(response_error)?;
        id(channel_id, false)?;
        let channel_title = text(&row["snippet"]["title"]);
        if channel_title.trim().is_empty() {
            return Err(response_error());
        }
        let system_playlist_ids = row
            .pointer("/contentDetails/relatedPlaylists")
            .and_then(Value::as_object)
            .map(|related| {
                related
                    .values()
                    .filter_map(Value::as_str)
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();
        Ok(Channel {
            id: channel_id.into(),
            title: channel_title,
            system_playlist_ids,
        })
    }
    fn playlist(&self, playlist_id: &str) -> Result<Value, AppError> {
        id(playlist_id, false)?;
        let response = self.get(
            "playlists",
            vec![
                ("part", "snippet,status,contentDetails".into()),
                ("id", playlist_id.into()),
            ],
        )?;
        items(&response)?
            .first()
            .cloned()
            .filter(|row| row["id"] == playlist_id)
            .ok_or_else(|| {
                AppError::new("ITEM_UNAVAILABLE", "This YouTube playlist is unavailable.")
            })
    }
    fn editable(row: &Value, account: &SavedMusicCredentials) -> bool {
        row["snippet"]["channelId"] == account.channel_id
            && !account
                .system_playlist_ids
                .iter()
                .any(|id| row["id"] == *id)
    }
    fn owned(&self, playlist_id: &str, account: &SavedMusicCredentials) -> Result<Value, AppError> {
        let row = self.playlist(playlist_id)?;
        if !Self::editable(&row, account) {
            return Err(read_only());
        }
        Ok(row)
    }
    fn playlist_model(
        row: &Value,
        account: &SavedMusicCredentials,
    ) -> Result<MusicPlaylist, AppError> {
        let playlist_id = row["id"].as_str().ok_or_else(response_error)?;
        id(playlist_id, false)?;
        Ok(MusicPlaylist {
            id: playlist_id.into(),
            title: text(&row["snippet"]["title"]),
            editable: Self::editable(row, account),
            artwork_url: thumbnail(&row["snippet"]),
        })
    }
    fn metadata(&self, ids: &[String]) -> Result<HashMap<String, Value>, AppError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let response = self.get(
            "videos",
            vec![
                ("part", "snippet,contentDetails,status".into()),
                ("id", ids.join(",")),
            ],
        )?;
        Ok(items(&response)?
            .iter()
            .filter_map(|row| Some((row["id"].as_str()?.into(), row.clone())))
            .collect())
    }
    fn ratings(&self, ids: &[String]) -> Result<HashMap<String, bool>, AppError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let response = self.get("videos/getRating", vec![("id", ids.join(","))])?;
        Ok(items(&response)?
            .iter()
            .filter_map(|row| {
                let rating = row["rating"].as_str()?;
                if !matches!(rating, "like" | "none" | "dislike") {
                    return None;
                }
                Some((row["videoId"].as_str()?.into(), rating == "like"))
            })
            .collect())
    }
    fn track(
        video_id: Option<&str>,
        fallback: &Value,
        metadata: Option<&Value>,
        liked: Option<bool>,
        item_id: Option<String>,
        position: Option<u32>,
    ) -> MusicTrack {
        let snippet = metadata.map(|row| &row["snippet"]).unwrap_or(fallback);
        let video_id = video_id.filter(|value| valid_id(value, true));
        let available = video_id.is_some()
            && metadata.is_some_and(|row| {
                !matches!(
                    row["status"]["uploadStatus"].as_str(),
                    Some("failed" | "rejected" | "deleted")
                )
            });
        MusicTrack {
            id: video_id.map(String::from),
            title: if text(&snippet["title"]).is_empty() {
                "Unavailable video".into()
            } else {
                text(&snippet["title"])
            },
            channel_title: if metadata.is_some() {
                text(&snippet["channelTitle"])
            } else {
                text(&fallback["videoOwnerChannelTitle"])
            },
            duration: metadata
                .and_then(|row| row["contentDetails"]["duration"].as_str())
                .and_then(duration),
            artwork_url: thumbnail(snippet),
            liked,
            available,
            item_id,
            position,
        }
    }
    pub fn browse(
        &self,
        query: MusicQuery,
        account: &SavedMusicCredentials,
    ) -> Result<MusicPage, AppError> {
        let mut page = MusicPage {
            tracks: Vec::new(),
            playlists: Vec::new(),
            playlist: None,
            next_page_token: None,
        };
        match query {
            MusicQuery::Playlists { page_token } => {
                let mut params = vec![
                    ("part", "snippet,status,contentDetails".into()),
                    ("mine", "true".into()),
                ];
                pagination(&mut params, page_token)?;
                let response = self.get("playlists", params)?;
                page.playlists = items(&response)?
                    .iter()
                    .map(|row| Self::playlist_model(row, account))
                    .collect::<Result<_, _>>()?;
                page.next_page_token = next(&response)?;
            }
            MusicQuery::Playlist {
                id: playlist_id,
                page_token,
            } => {
                page.playlist = Some(Self::playlist_model(
                    &self.playlist(&playlist_id)?,
                    account,
                )?);
                let mut params = vec![
                    ("part", "snippet,contentDetails".into()),
                    ("playlistId", playlist_id),
                ];
                pagination(&mut params, page_token)?;
                let response = self.get("playlistItems", params)?;
                let rows = items(&response)?;
                if rows.len() > 50 {
                    return Err(response_error());
                }
                let ids: Vec<String> = rows
                    .iter()
                    .filter_map(|row| {
                        row.pointer("/snippet/resourceId/videoId")
                            .and_then(Value::as_str)
                    })
                    .filter(|id| valid_id(id, true))
                    .map(String::from)
                    .collect();
                let metadata = self.metadata(&ids)?;
                // Deleted/private entries may retain an ID in playlistItems.
                // Only request ratings for videos the metadata endpoint returned.
                let visible_ids = ids
                    .iter()
                    .filter(|id| metadata.contains_key(*id))
                    .cloned()
                    .collect::<Vec<_>>();
                let ratings = self.ratings(&visible_ids)?;
                page.tracks = rows
                    .iter()
                    .map(|row| {
                        let video_id = row
                            .pointer("/snippet/resourceId/videoId")
                            .and_then(Value::as_str);
                        Self::track(
                            video_id,
                            &row["snippet"],
                            video_id.and_then(|id| metadata.get(id)),
                            video_id.and_then(|id| ratings.get(id).copied()),
                            row["id"].as_str().map(String::from),
                            row["snippet"]["position"]
                                .as_u64()
                                .and_then(|n| n.try_into().ok()),
                        )
                    })
                    .collect();
                page.next_page_token = next(&response)?;
            }
            MusicQuery::Liked { page_token } => {
                let mut params = vec![
                    ("part", "snippet,contentDetails,status".into()),
                    ("myRating", "like".into()),
                ];
                pagination(&mut params, page_token)?;
                let response = self.get("videos", params)?;
                page.tracks = items(&response)?
                    .iter()
                    .map(|row| {
                        Self::track(
                            row["id"].as_str(),
                            &row["snippet"],
                            Some(row),
                            Some(true),
                            None,
                            None,
                        )
                    })
                    .collect();
                page.next_page_token = next(&response)?;
            }
            MusicQuery::Search {
                query,
                filter,
                page_token,
            } => {
                let query = query.trim();
                if query.is_empty() || query.chars().count() > 200 {
                    return Err(invalid());
                }
                let mut params = vec![
                    ("part", "snippet".into()),
                    ("type", "video".into()),
                    ("q", query.into()),
                ];
                if matches!(filter, SearchFilter::Music) {
                    params.push(("videoCategoryId", "10".into()));
                }
                pagination(&mut params, page_token)?;
                let response = self.get("search", params)?;
                let rows = items(&response)?;
                if rows.len() > 50 {
                    return Err(response_error());
                }
                let ids: Vec<String> = rows
                    .iter()
                    .filter_map(|row| row.pointer("/id/videoId").and_then(Value::as_str))
                    .filter(|id| valid_id(id, true))
                    .map(String::from)
                    .collect();
                let metadata = self.metadata(&ids)?;
                let visible_ids = ids
                    .iter()
                    .filter(|id| metadata.contains_key(*id))
                    .cloned()
                    .collect::<Vec<_>>();
                let ratings = self.ratings(&visible_ids)?;
                page.tracks = rows
                    .iter()
                    .filter_map(|row| {
                        let video_id = row.pointer("/id/videoId").and_then(Value::as_str)?;
                        Some(Self::track(
                            Some(video_id),
                            &row["snippet"],
                            metadata.get(video_id),
                            ratings.get(video_id).copied(),
                            None,
                            None,
                        ))
                    })
                    .collect();
                page.next_page_token = next(&response)?;
            }
        }
        Ok(page)
    }
    fn entry(&self, playlist_id: &str, item_id: &str) -> Result<Value, AppError> {
        id(item_id, false)?;
        let response = self.get(
            "playlistItems",
            vec![
                ("part", "snippet,contentDetails".into()),
                ("id", item_id.into()),
            ],
        )?;
        items(&response)?
            .first()
            .cloned()
            .filter(|row| row["id"] == item_id && row["snippet"]["playlistId"] == playlist_id)
            .ok_or_else(|| {
                AppError::new(
                    "PLAYLIST_CHANGED",
                    "This entry changed or disappeared. Reload the playlist.",
                )
            })
    }
    pub fn change(
        &self,
        change: MusicChange,
        account: &SavedMusicCredentials,
    ) -> Result<(), AppError> {
        match change {
            MusicChange::Like {
                id: video_id,
                liked,
            } => {
                id(&video_id, true)?;
                self.transport.request(
                    Method::POST,
                    "videos/rate",
                    vec![
                        ("id", video_id),
                        ("rating", if liked { "like" } else { "none" }.into()),
                    ],
                    None,
                )?;
            }
            MusicChange::Create { title: name } => {
                let result = self.transport.request(Method::POST, "playlists", vec![("part", "snippet,status".into())], Some(json!({"snippet":{"title":title(&name)?},"status":{"privacyStatus":"private"}})))?;
                if result["id"].as_str().is_none_or(|id| !valid_id(id, false))
                    || result["status"]["privacyStatus"] != "private"
                {
                    return Err(response_error());
                }
            }
            MusicChange::Rename {
                id: playlist_id,
                title: name,
            } => {
                let old = self.owned(&playlist_id, account)?;
                let mut snippet = json!({"title":title(&name)?, "description":old["snippet"]["description"].as_str().unwrap_or("")});
                if let Some(language) = old["snippet"].get("defaultLanguage") {
                    snippet["defaultLanguage"] = language.clone();
                }
                let result = self.transport.request(
                    Method::PUT,
                    "playlists",
                    vec![("part", "snippet".into())],
                    Some(json!({"id":playlist_id,"snippet":snippet})),
                )?;
                if result["id"] != playlist_id || result["snippet"]["title"] != snippet["title"] {
                    return Err(response_error());
                }
            }
            MusicChange::Add {
                id: playlist_id,
                track_id,
            } => {
                id(&track_id, true)?;
                self.owned(&playlist_id, account)?;
                let result = self.transport.request(Method::POST, "playlistItems", vec![("part", "snippet".into())], Some(json!({"snippet":{"playlistId":playlist_id,"resourceId":{"kind":"youtube#video","videoId":track_id}}})))?;
                if result["id"].as_str().is_none()
                    || result["snippet"]["playlistId"] != playlist_id
                    || result["snippet"]["resourceId"]["videoId"] != track_id
                {
                    return Err(response_error());
                }
            }
            MusicChange::Remove {
                id: playlist_id,
                item_id,
            } => {
                self.owned(&playlist_id, account)?;
                self.entry(&playlist_id, &item_id)?;
                self.transport.request(
                    Method::DELETE,
                    "playlistItems",
                    vec![("id", item_id)],
                    None,
                )?;
            }
            MusicChange::Move {
                id: playlist_id,
                item_id,
                direction,
            } => {
                let playlist = self.owned(&playlist_id, account)?;
                let entry = self.entry(&playlist_id, &item_id)?;
                let current = entry["snippet"]["position"]
                    .as_u64()
                    .ok_or_else(response_error)?;
                let count = playlist["contentDetails"]["itemCount"]
                    .as_u64()
                    .ok_or_else(response_error)?;
                let position = match direction {
                    MoveDirection::Up => current.checked_sub(1),
                    MoveDirection::Down => current.checked_add(1).filter(|n| *n < count),
                }
                .ok_or_else(|| {
                    AppError::new(
                        "PLAYLIST_CHANGED",
                        "This entry cannot move further. Reload the playlist.",
                    )
                })?;
                let resource = entry["snippet"]["resourceId"].clone();
                if resource["kind"] != "youtube#video"
                    || resource["videoId"]
                        .as_str()
                        .is_none_or(|id| !valid_id(id, true))
                {
                    return Err(response_error());
                }
                let result = self.transport.request(Method::PUT, "playlistItems", vec![("part", "snippet".into())], Some(json!({"id":item_id,"snippet":{"playlistId":playlist_id,"resourceId":resource,"position":position}})))?;
                if result["id"] != item_id
                    || result["snippet"]["position"] != position
                    || result["snippet"]["playlistId"] != playlist_id
                {
                    return Err(response_error());
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    #[test]
    fn bodyless_write_requests_have_zero_content_length_without_json() {
        let transport = HttpTransport::new("fixture".into()).unwrap();
        for (method, route) in [
            (Method::POST, "videos/rate"),
            (Method::DELETE, "playlistItems"),
        ] {
            let request = transport
                .prepare(method, route, vec![("id", "fixture".into())], None)
                .build()
                .unwrap();
            assert_eq!(request.headers()[reqwest::header::CONTENT_LENGTH], "0");
            assert!(request
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .is_none());
            assert!(request.body().is_none());
        }
    }
    type Call = (Method, &'static str, Params, Option<Value>);
    struct Fake {
        replies: Mutex<std::collections::VecDeque<Result<Value, AppError>>>,
        calls: Mutex<Vec<Call>>,
    }
    impl Fake {
        fn new(replies: Vec<Value>) -> Self {
            Self {
                replies: Mutex::new(replies.into_iter().map(Ok).collect()),
                calls: Mutex::new(Vec::new()),
            }
        }
    }
    impl Transport for Fake {
        fn request(
            &self,
            method: Method,
            route: &'static str,
            params: Params,
            body: Option<Value>,
        ) -> Result<Value, AppError> {
            self.calls
                .lock()
                .unwrap()
                .push((method, route, params, body));
            self.replies
                .lock()
                .unwrap()
                .pop_front()
                .expect("Unexpected API request")
        }
    }
    fn account() -> SavedMusicCredentials {
        SavedMusicCredentials {
            format_version: 2,
            provider: "youtubeDataApi".into(),
            client_id: "fixture".into(),
            channel_id: "UCfixture".into(),
            channel_title: "Fixture channel".into(),
            system_playlist_ids: vec!["UUfixture".into()],
            tokens: music_oauth::Tokens {
                access_token: "fixture".into(),
                refresh_token: "fixture".into(),
                expires_at: music_oauth::now() + 3600,
                scope: music_oauth::SCOPE.into(),
                token_type: "Bearer".into(),
                expires_in: 3600,
            },
        }
    }
    fn playlist() -> Value {
        json!({"id":"PLfixture","snippet":{"channelId":"UCfixture","title":"Old","description":"Keep description","defaultLanguage":"en"},"contentDetails":{"itemCount":3}})
    }
    #[test]
    fn verifies_channel_and_rejects_missing_or_ambiguous_accounts() {
        for rows in [json!([]), json!([{}, {}])] {
            let fake = Fake::new(vec![json!({"items":rows})]);
            assert!(YoutubeApi { transport: &fake }.account().is_err());
        }
        let fake = Fake::new(vec![
            json!({"items":[{"id":"UCfixture","snippet":{"title":"Channel"},"contentDetails":{"relatedPlaylists":{"uploads":"UUfixture"}}}]}),
        ]);
        let verified = YoutubeApi { transport: &fake }.account().unwrap();
        assert_eq!(verified.title, "Channel");
        assert_eq!(verified.system_playlist_ids, vec!["UUfixture"]);
    }
    #[test]
    fn rename_preserves_metadata_and_does_not_send_privacy() {
        let fake = Fake::new(vec![
            json!({"items":[playlist()]}),
            json!({"id":"PLfixture","snippet":{"title":"New"}}),
        ]);
        YoutubeApi { transport: &fake }
            .change(
                MusicChange::Rename {
                    id: "PLfixture".into(),
                    title: "New".into(),
                },
                &account(),
            )
            .unwrap();
        let calls = fake.calls.lock().unwrap();
        let body = calls[1].3.as_ref().unwrap();
        assert_eq!(body["snippet"]["description"], "Keep description");
        assert_eq!(body["snippet"]["defaultLanguage"], "en");
        assert!(body.get("status").is_none());
    }
    #[test]
    fn rejects_foreign_and_system_playlists_before_writing() {
        for row in [
            json!({"id":"PLfixture","snippet":{"channelId":"other"}}),
            json!({"id":"UUfixture","snippet":{"channelId":"UCfixture"}}),
        ] {
            let id = row["id"].as_str().unwrap().to_owned();
            let fake = Fake::new(vec![json!({"items":[row]})]);
            assert_eq!(
                YoutubeApi { transport: &fake }
                    .change(
                        MusicChange::Rename {
                            id,
                            title: "New".into()
                        },
                        &account()
                    )
                    .unwrap_err()
                    .code,
                "PLAYLIST_READ_ONLY"
            );
            assert_eq!(fake.calls.lock().unwrap().len(), 1);
        }
    }
    #[test]
    fn moves_one_occurrence_and_preserves_content_details() {
        let fake = Fake::new(vec![
            json!({"items":[playlist()]}),
            json!({"items":[{"id":"entry2","snippet":{"playlistId":"PLfixture","position":1,"resourceId":{"kind":"youtube#video","videoId":"dQw4w9WgXcQ"}},"contentDetails":{"startAt":"PT1S"}}]}),
            json!({"id":"entry2","snippet":{"playlistId":"PLfixture","position":0}}),
        ]);
        YoutubeApi { transport: &fake }
            .change(
                MusicChange::Move {
                    id: "PLfixture".into(),
                    item_id: "entry2".into(),
                    direction: MoveDirection::Up,
                },
                &account(),
            )
            .unwrap();
        let calls = fake.calls.lock().unwrap();
        let body = calls[2].3.as_ref().unwrap();
        assert_eq!(body["id"], "entry2");
        assert_eq!(body["snippet"]["position"], 0);
        assert!(body.get("contentDetails").is_none());
    }
    #[test]
    fn cursor_search_uses_music_filter_and_enriches_ratings() {
        let fake = Fake::new(vec![
            json!({"items":[{"id":{"videoId":"dQw4w9WgXcQ"},"snippet":{"title":"Video"}}],"nextPageToken":"next"}),
            json!({"items":[{"id":"dQw4w9WgXcQ","snippet":{"title":"Video","channelTitle":"Uploader"},"contentDetails":{"duration":"PT1H2M3S"}}]}),
            json!({"items":[{"videoId":"dQw4w9WgXcQ","rating":"like"}]}),
        ]);
        let page = YoutubeApi { transport: &fake }
            .browse(
                MusicQuery::Search {
                    query: "song".into(),
                    filter: SearchFilter::Music,
                    page_token: Some("cursor".into()),
                },
                &account(),
            )
            .unwrap();
        assert_eq!(page.next_page_token.as_deref(), Some("next"));
        assert_eq!(page.tracks[0].channel_title, "Uploader");
        assert_eq!(page.tracks[0].duration.as_deref(), Some("1:02:03"));
        assert_eq!(page.tracks[0].liked, Some(true));
        let calls = fake.calls.lock().unwrap();
        assert!(calls[0].2.contains(&("videoCategoryId", "10".into())));
        assert!(calls[0].2.contains(&("pageToken", "cursor".into())));
        assert!(calls[0].2.contains(&("maxResults", "25".into())));
    }
    #[test]
    fn playlist_preserves_duplicates_and_unavailable_entries() {
        let rows = vec![
            json!({"id":"first","snippet":{"resourceId":{"videoId":"dQw4w9WgXcQ"},"position":0}}),
            json!({"id":"second","snippet":{"resourceId":{"videoId":"dQw4w9WgXcQ"},"position":1}}),
            json!({"id":"removed","snippet":{"title":"Deleted video","resourceId":{"videoId":"unavailable"},"position":2}}),
        ];
        let fake = Fake::new(vec![
            json!({"items":[playlist()]}),
            json!({"items":rows}),
            json!({"items":[{"id":"dQw4w9WgXcQ","snippet":{"title":"Video"}}]}),
            json!({"items":[{"videoId":"dQw4w9WgXcQ","rating":"none"}]}),
        ]);
        let page = YoutubeApi { transport: &fake }
            .browse(
                MusicQuery::Playlist {
                    id: "PLfixture".into(),
                    page_token: None,
                },
                &account(),
            )
            .unwrap();
        assert_eq!(page.tracks.len(), 3);
        assert_ne!(page.tracks[0].item_id, page.tracks[1].item_id);
        assert!(!page.tracks[2].available);
        assert_eq!(page.tracks[2].item_id.as_deref(), Some("removed"));
        let calls = fake.calls.lock().unwrap();
        let rating_ids = calls[3].2.iter().find(|(key, _)| *key == "id").unwrap();
        assert!(!rating_ids.1.contains("unavailable"));
    }
    #[test]
    fn empty_success_and_provider_errors_are_safe_and_specific() {
        assert_eq!(decode_response(204, b"").unwrap(), Value::Null);
        for (status, reason, code) in [
            (401, "authError", "SESSION_EXPIRED"),
            (403, "quotaExceeded", "YOUTUBE_QUOTA"),
            (403, "accessNotConfigured", "YOUTUBE_API_DISABLED"),
            (403, "insufficientPermissions", "YOUTUBE_PERMISSION"),
            (400, "manualSortRequired", "PLAYLIST_SORT_REQUIRED"),
        ] {
            let error = api_error(
                status,
                &json!({"error":{"message":"secret-token","errors":[{"reason":reason}]}}),
            );
            assert_eq!(error.code, code);
            assert_eq!(error.http_status, Some(status));
            assert!(!error.message.contains("secret-token"));
        }
        let error = api_error(
            500,
            &json!({"error":{"errors":[{"reason":"private-secret"}]}}),
        );
        assert_eq!(error.provider_reason.as_deref(), Some("unknown"));
    }
    #[test]
    fn failed_write_is_not_retried() {
        let fake = Fake {
            replies: Mutex::new(vec![Err(AppError::new("OFFLINE", "uncertain"))].into()),
            calls: Mutex::new(Vec::new()),
        };
        assert!(YoutubeApi { transport: &fake }
            .change(
                MusicChange::Like {
                    id: "dQw4w9WgXcQ".into(),
                    liked: true
                },
                &account()
            )
            .is_err());
        assert_eq!(fake.calls.lock().unwrap().len(), 1);
    }
    #[test]
    fn creates_private_playlists_and_removes_unavailable_entries_by_id() {
        let fake = Fake::new(vec![
            json!({"id":"PLnew","status":{"privacyStatus":"private"}}),
            json!({"items":[playlist()]}),
            json!({"items":[{"id":"deletedEntry","snippet":{"playlistId":"PLfixture"}}]}),
            Value::Null,
        ]);
        let api = YoutubeApi { transport: &fake };
        api.change(
            MusicChange::Create {
                title: "Private".into(),
            },
            &account(),
        )
        .unwrap();
        api.change(
            MusicChange::Remove {
                id: "PLfixture".into(),
                item_id: "deletedEntry".into(),
            },
            &account(),
        )
        .unwrap();
        let calls = fake.calls.lock().unwrap();
        assert_eq!(
            calls[0].3.as_ref().unwrap()["status"]["privacyStatus"],
            "private"
        );
        assert_eq!(calls[3].0, Method::DELETE);
        assert_eq!(calls[3].2, vec![("id", "deletedEntry".into())]);
    }
}
