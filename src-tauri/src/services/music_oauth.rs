use crate::models::AppError;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use url::Url;

// This content/playlist scope supports Aura's API operations without requesting
// the broader account-management scope. It is still a sensitive permission.
pub const SCOPE: &str = "https://www.googleapis.com/auth/youtube.force-ssl";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";

// Desktop client secrets identify the installed app; Google does not consider
// them confidential. User tokens must still never leave the native boundary.
pub fn client() -> Option<(&'static str, &'static str)> {
    let id = option_env!("AURA_MUSIC_CLIENT_ID")?;
    let secret = option_env!("AURA_MUSIC_CLIENT_SECRET")?;
    (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
}

pub fn validation_build() -> bool {
    cfg!(all(debug_assertions, feature = "music-validation"))
}

pub fn gate() -> Result<(), AppError> {
    // Public enablement is a reviewed source change with recorded evidence.
    let record: serde_json::Value =
        serde_json::from_str(include_str!("../../music-release-gate.json"))
            .map_err(|_| unavailable())?;
    let released = record["youtubeDataApiValidated"] == true
        && record["publicDistributionApproved"] == true
        && record["windowsReleaseValidated"] == true;
    if client().is_none() || (!released && !validation_build()) {
        return Err(unavailable());
    }
    Ok(())
}

pub fn unavailable() -> AppError {
    AppError::new("MUSIC_UNAVAILABLE", "YouTube account connection is unavailable until Aura's Google client, official API integration and public release requirements are validated.")
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub scope: String,
    pub token_type: String,
    pub expires_in: u64,
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn random() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn http() -> Result<reqwest::blocking::Client, AppError> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .map_err(|_| network_error())
}

fn token_request(fields: &[(&str, &str)], old: Option<&Tokens>) -> Result<Tokens, AppError> {
    let (id, secret) = client().ok_or_else(unavailable)?;
    let response = http()?
        .post(TOKEN_URL)
        .form(&[fields, &[("client_id", id), ("client_secret", secret)]].concat())
        .send()
        .map_err(|_| network_error())?;
    let success = response.status().is_success();
    let data: serde_json::Value =
        serde_json::from_reader(response.take(65_536)).map_err(|_| network_error())?;
    parse_tokens(&data, success, old)
}

fn parse_tokens(
    data: &serde_json::Value,
    success: bool,
    old: Option<&Tokens>,
) -> Result<Tokens, AppError> {
    if !success {
        return Err(if data["error"] == "invalid_grant" {
            AppError::new(
                "SESSION_EXPIRED",
                "Your session expired. Reconnect YouTube.",
            )
        } else {
            AppError::new(
                "OAUTH_REJECTED",
                "Google could not authorize Aura. Check the developer client configuration.",
            )
        });
    }
    let access = data["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(network_error)?;
    let refresh = data["refresh_token"]
        .as_str()
        .or_else(|| old.map(|t| t.refresh_token.as_str()))
        .filter(|s| !s.is_empty())
        .ok_or_else(network_error)?;
    let expires = data["expires_in"]
        .as_u64()
        .filter(|s| *s > 0 && *s < 86400)
        .ok_or_else(network_error)?;
    let scope = data["scope"]
        .as_str()
        .or_else(|| old.map(|t| t.scope.as_str()))
        .unwrap_or("");
    if !scope.split_whitespace().any(|s| s == SCOPE)
        || data["token_type"].as_str().unwrap_or("") != "Bearer"
    {
        return Err(AppError::new(
            "OAUTH_SCOPE",
            "Google did not grant Aura the required YouTube permission.",
        ));
    }
    Ok(Tokens {
        access_token: access.into(),
        refresh_token: refresh.into(),
        expires_at: now() + expires,
        scope: scope.into(),
        token_type: "Bearer".into(),
        expires_in: expires,
    })
}

pub fn refresh(tokens: &Tokens) -> Result<Tokens, AppError> {
    if tokens.expires_at > now() + 90 {
        return Ok(tokens.clone());
    }
    token_request(
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", &tokens.refresh_token),
        ],
        Some(tokens),
    )
}

pub fn revoke(tokens: &Tokens) -> Result<(), AppError> {
    // Keep tokens out of URLs and diagnostics. Revocation covers this Google
    // project's grant, not just the current access token.
    let response = http()
        .map_err(|_| revocation_error())?
        .post(REVOKE_URL)
        .form(&[("token", tokens.refresh_token.as_str())])
        .send()
        .map_err(|_| revocation_error())?;
    let status = response.status().as_u16();
    let body: serde_json::Value = if status == 400 {
        serde_json::from_reader(response.take(65_536)).unwrap_or_default()
    } else {
        serde_json::Value::Null
    };
    revocation_result(status, &body)
}

fn revocation_result(status: u16, body: &serde_json::Value) -> Result<(), AppError> {
    if status == 200 || (status == 400 && body["error"] == "invalid_token") {
        Ok(())
    } else {
        Err(revocation_error())
    }
}

fn revocation_error() -> AppError {
    AppError::new(
        "OAUTH_REVOKE_REQUIRED",
        "Local YouTube data was removed, but Google access removal could not be confirmed. Remove Aura in your Google account's third-party connections.",
    )
}

pub fn authorize(generation: &AtomicU64, expected: u64) -> Result<Tokens, AppError> {
    gate()?;
    let (id, _) = client().ok_or_else(unavailable)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| network_error())?;
    listener
        .set_nonblocking(true)
        .map_err(|_| network_error())?;
    let redirect = format!(
        "http://127.0.0.1:{}/oauth/callback",
        listener.local_addr().map_err(|_| network_error())?.port()
    );
    let state = random();
    let verifier = random();
    let mut url =
        Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|_| network_error())?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", id),
        ("redirect_uri", &redirect),
        ("response_type", "code"),
        ("scope", SCOPE),
        ("access_type", "offline"),
        ("prompt", "consent"),
        ("state", &state),
        ("code_challenge", &challenge(&verifier)),
        ("code_challenge_method", "S256"),
    ]);
    super::music::open_url(url.as_str())?;
    let deadline = Instant::now() + Duration::from_secs(180);
    while Instant::now() < deadline {
        if generation.load(Ordering::SeqCst) != expected {
            return Err(cancelled());
        }
        match listener.accept() {
            Ok((mut stream, peer)) if peer.ip().is_loopback() => {
                stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
                stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
                let mut buffer = [0u8; 8192];
                let size = stream.read(&mut buffer).unwrap_or(0);
                let text = String::from_utf8_lossy(&buffer[..size]);
                let result = callback(text.lines().next().unwrap_or(""), &state);
                let message = if result.is_ok() {
                    "Authorization received. Return to Aura."
                } else {
                    "Authorization was not accepted. Return to Aura."
                };
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", message.len(), message);
                match result {
                    Ok(code) => {
                        if generation.load(Ordering::SeqCst) != expected {
                            return Err(cancelled());
                        }
                        return token_request(
                            &[
                                ("grant_type", "authorization_code"),
                                ("code", &code),
                                ("redirect_uri", &redirect),
                                ("code_verifier", &verifier),
                            ],
                            None,
                        );
                    }
                    Err(error) if error.code == "OAUTH_CALLBACK" => continue,
                    Err(error) => return Err(error),
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            _ => return Err(network_error()),
        }
    }
    Err(AppError::new(
        "OAUTH_TIMEOUT",
        "Sign-in timed out. Start again when you are ready.",
    ))
}

fn callback(line: &str, expected_state: &str) -> Result<String, AppError> {
    let parts: Vec<_> = line.split_whitespace().collect();
    let invalid = || AppError::new("OAUTH_CALLBACK", "The OAuth callback was not accepted.");
    if parts.len() != 3 || parts[0] != "GET" || !parts[1].starts_with("/oauth/callback?") {
        return Err(invalid());
    }
    let url = Url::parse(&format!("http://127.0.0.1{}", parts[1])).map_err(|_| invalid())?;
    let pairs: Vec<_> = url.query_pairs().collect();
    let field = |key| {
        let values: Vec<_> = pairs.iter().filter(|(k, _)| k == key).collect();
        (values.len() == 1).then(|| values[0].1.to_string())
    };
    if field("state").as_deref() != Some(expected_state) {
        return Err(invalid());
    }
    if field("error").is_some() {
        return Err(cancelled());
    }
    field("code")
        .filter(|s| !s.is_empty() && s.len() <= 4096)
        .ok_or_else(invalid)
}

pub fn cancelled() -> AppError {
    AppError::new("OAUTH_CANCELLED", "Sign-in was cancelled.")
}
fn network_error() -> AppError {
    AppError::new(
        "OFFLINE",
        "Could not reach Google. Check your connection and try again.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_rfc_vector() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(random().len(), 43);
    }
    #[test]
    fn callback_requires_state_and_rejects_ambiguity() {
        assert_eq!(
            callback("GET /oauth/callback?state=s&code=c HTTP/1.1", "s").unwrap(),
            "c"
        );
        for query in [
            "state=wrong&code=c",
            "code=c",
            "state=s&state=s&code=c",
            "state=s&code=a&code=b",
        ] {
            assert!(callback(&format!("GET /oauth/callback?{query} HTTP/1.1"), "s").is_err());
        }
        assert_eq!(
            callback(
                "GET /oauth/callback?state=s&error=access_denied HTTP/1.1",
                "s"
            )
            .unwrap_err()
            .code,
            "OAUTH_CANCELLED"
        );
    }
    #[test]
    fn refresh_preserves_refresh_token_and_requires_scope() {
        let data = serde_json::json!({"access_token":"a", "refresh_token":"r", "expires_in":3600, "scope":SCOPE,"token_type":"Bearer"});
        let old = parse_tokens(&data, true, None).unwrap();
        let mut fresh = data.clone();
        fresh.as_object_mut().unwrap().remove("refresh_token");
        assert_eq!(
            parse_tokens(&fresh, true, Some(&old))
                .unwrap()
                .refresh_token,
            "r"
        );
        fresh["scope"] = "unrelated".into();
        assert!(parse_tokens(&fresh, true, Some(&old)).is_err());
        assert_eq!(
            parse_tokens(
                &serde_json::json!({"error":"invalid_grant"}),
                false,
                Some(&old)
            )
            .err()
            .unwrap()
            .code,
            "SESSION_EXPIRED"
        );
    }

    #[test]
    fn revocation_accepts_success_and_already_invalid_tokens_only() {
        assert!(revocation_result(200, &serde_json::Value::Null).is_ok());
        assert!(revocation_result(400, &serde_json::json!({"error":"invalid_token"})).is_ok());
        for status in [302, 400, 401, 429, 500] {
            let error = revocation_result(
                status,
                &serde_json::json!({"error":"provider_secret_do_not_expose"}),
            )
            .unwrap_err();
            assert_eq!(error.code, "OAUTH_REVOKE_REQUIRED");
            assert!(!error.message.contains("provider_secret"));
        }
    }
}
