use super::music_oauth::Tokens;
use crate::models::AppError;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedMusicCredentials {
    pub format_version: u32,
    pub provider: String,
    pub client_id: String,
    pub channel_id: String,
    pub channel_title: String,
    pub system_playlist_ids: Vec<String>,
    pub tokens: Tokens,
}

pub struct Vault(pub Option<PathBuf>);

impl Vault {
    pub fn load(&self) -> Result<Option<SavedMusicCredentials>, AppError> {
        let path = self
            .0
            .as_ref()
            .ok_or_else(error)?
            .join("music-credentials.bin");
        if !path.exists() {
            return Ok(None);
        }
        if fs::metadata(&path).map_err(|_| error())?.len() > 65_536 {
            return Err(error());
        }
        let encrypted = fs::read(path).map_err(|_| error())?;
        let value: serde_json::Value =
            serde_json::from_slice(&unprotect(&encrypted)?).map_err(|_| error())?;
        if value["formatVersion"] != 2 || value["provider"] != "youtubeDataApi" {
            self.clear()?;
            return Err(AppError::new(
                "RECONNECT_REQUIRED",
                "Reconnect YouTube to use Aura's official API integration.",
            ));
        }
        let record: SavedMusicCredentials = serde_json::from_value(value).map_err(|_| error())?;
        Ok(Some(record))
    }
    pub fn save(&self, tokens: &SavedMusicCredentials) -> Result<(), AppError> {
        let directory = self.0.as_ref().ok_or_else(error)?;
        let plaintext = serde_json::to_vec(tokens).map_err(|_| error())?;
        let encrypted = protect(&plaintext)?;
        fs::create_dir_all(directory).map_err(|_| error())?;
        let temp = directory.join(format!("music-credentials.{}.tmp", std::process::id()));
        let result = fs::write(&temp, encrypted)
            .and_then(|_| fs::rename(&temp, directory.join("music-credentials.bin")));
        if result.is_err() {
            let _ = fs::remove_file(temp);
            return Err(error());
        }
        Ok(())
    }
    pub fn clear(&self) -> Result<(), AppError> {
        let directory = self.0.as_ref().ok_or_else(error)?;
        match fs::remove_file(directory.join("music-credentials.bin")) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(error()),
        }
        // Remove encrypted remnants left by an interrupted atomic save. Only
        // this module's exact filename pattern is eligible; never recurse.
        match fs::read_dir(directory) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(|_| error())?;
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    if name
                        .strip_prefix("music-credentials.")
                        .and_then(|s| s.strip_suffix(".tmp"))
                        .is_some_and(|s| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit()))
                    {
                        fs::remove_file(entry.path()).map_err(|_| error())?;
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(error()),
        }
        Ok(())
    }
}

fn error() -> AppError {
    AppError::new(
        "CREDENTIAL_STORAGE",
        "Aura could not access its encrypted music credentials.",
    )
}

#[cfg(windows)]
fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, AppError> {
    use windows::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // DPAPI's default scope is the current Windows user, never LOCAL_MACHINE.
    unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
        .map_err(|_| error())?;
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        // Clear the OS plaintext buffer before releasing it.
        std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(
            output.pbData.cast(),
        )));
        Ok(result)
    }
}
#[cfg(windows)]
fn protect(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    crypt(bytes, true)
}
#[cfg(windows)]
fn unprotect(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    crypt(bytes, false)
}
#[cfg(not(windows))]
fn protect(_: &[u8]) -> Result<Vec<u8>, AppError> {
    Err(error())
}
#[cfg(not(windows))]
fn unprotect(_: &[u8]) -> Result<Vec<u8>, AppError> {
    Err(error())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn dpapi_roundtrip_is_not_plaintext() {
        let data = b"test-only-token";
        let encrypted = protect(data).unwrap();
        assert!(!encrypted.windows(data.len()).any(|w| w == data));
        assert_eq!(unprotect(&encrypted).unwrap(), data);
        assert!(unprotect(b"corrupt").is_err());
    }

    #[test]
    fn legacy_credentials_are_removed_and_require_reconnection() {
        let directory = std::env::temp_dir().join(format!(
            "aura-legacy-{}-{}",
            std::process::id(),
            super::super::music_oauth::now()
        ));
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("music-credentials.bin"),
            protect(br#"{"access_token":"fixture","refresh_token":"fixture"}"#).unwrap(),
        )
        .unwrap();
        let error = Vault(Some(directory.clone())).load().err().unwrap();
        assert_eq!(error.code, "RECONNECT_REQUIRED");
        assert!(!directory.join("music-credentials.bin").exists());
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn versioned_official_record_roundtrips_encrypted() {
        let directory = std::env::temp_dir().join(format!(
            "aura-vault-v2-{}-{}",
            std::process::id(),
            super::super::music_oauth::now()
        ));
        let vault = Vault(Some(directory.clone()));
        let saved = SavedMusicCredentials {
            format_version: 2,
            provider: "youtubeDataApi".into(),
            client_id: "fixture".into(),
            channel_id: "UCfixture".into(),
            channel_title: "Channel".into(),
            system_playlist_ids: vec!["UUfixture".into()],
            tokens: Tokens {
                access_token: "fixture-access".into(),
                refresh_token: "fixture-refresh".into(),
                expires_at: 3600,
                expires_in: 3600,
                scope: super::super::music_oauth::SCOPE.into(),
                token_type: "Bearer".into(),
            },
        };
        vault.save(&saved).unwrap();
        let loaded = vault.load().unwrap().unwrap();
        assert_eq!(loaded.channel_id, "UCfixture");
        assert_eq!(loaded.tokens.refresh_token, "fixture-refresh");
        let encrypted = fs::read(directory.join("music-credentials.bin")).unwrap();
        assert!(!encrypted.windows(14).any(|s| s == b"fixture-access"));
        vault.clear().unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
