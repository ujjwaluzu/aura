use super::{
    github_api::{Failure, Tokens},
    music_vault::{protect, unprotect},
};
use crate::models::github::Calendar;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedAccount {
    pub version: u32,
    pub client_id: String,
    pub account_id: String,
    pub tokens: Tokens,
    pub calendar: Option<Calendar>,
}
pub struct Vault(pub Option<PathBuf>);
impl Vault {
    pub fn load(&self, client_id: &str) -> Result<Option<SavedAccount>, Failure> {
        let directory = self.0.as_ref().ok_or(Failure::Storage)?;
        let file = directory.join("github-account.bin");
        let encrypted = match fs::read(&file) {
            Ok(data) if data.len() <= 262_144 => data,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            _ => return Err(Failure::Storage),
        };
        let mut bytes = unprotect(&encrypted).map_err(|_| Failure::Storage)?;
        let saved = serde_json::from_slice::<SavedAccount>(&bytes);
        bytes.fill(0);
        let saved = saved.map_err(|_| Failure::Storage)?;
        if saved.version != 1
            || saved.client_id != client_id
            || saved
                .calendar
                .as_ref()
                .is_some_and(|c| c.account_id != saved.account_id)
        {
            return Err(Failure::Reconnect);
        }
        Ok(Some(saved))
    }
    pub fn save(&self, saved: &SavedAccount) -> Result<(), Failure> {
        let dir = self.0.as_ref().ok_or(Failure::Storage)?;
        let mut bytes = serde_json::to_vec(saved).map_err(|_| Failure::Storage)?;
        let encrypted = protect(&bytes).map_err(|_| Failure::Storage);
        bytes.fill(0);
        let encrypted = encrypted?;
        fs::create_dir_all(dir).map_err(|_| Failure::Storage)?;
        let temp = dir.join("github-account.tmp");
        if fs::write(&temp, encrypted)
            .and_then(|_| fs::rename(&temp, dir.join("github-account.bin")))
            .is_err()
        {
            let _ = fs::remove_file(temp);
            return Err(Failure::Storage);
        }
        Ok(())
    }
    pub fn clear(&self) -> Result<(), Failure> {
        let dir = self.0.as_ref().ok_or(Failure::Storage)?;
        let mut failed = false;
        for name in ["github-account.bin", "github-account.tmp"] {
            if let Err(e) = fs::remove_file(dir.join(name)) {
                failed |= e.kind() != std::io::ErrorKind::NotFound;
            }
        }
        if failed {
            Err(Failure::Storage)
        } else {
            Ok(())
        }
    }
}
