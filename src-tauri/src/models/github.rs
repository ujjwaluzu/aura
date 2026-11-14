use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionDay {
    pub date: String,
    pub contribution_count: u32,
    pub contribution_level: String,
    pub weekday: u8,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionWeek {
    pub contribution_days: Vec<ContributionDay>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Calendar {
    pub account_id: String,
    pub login: String,
    pub total_contributions: u32,
    pub weeks: Vec<ContributionWeek>,
    pub updated_at: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthorization {
    pub user_code: String,
    pub expires_at: u64,
}
/// The only GitHub data allowed across IPC. Tokens and device codes stay native.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubState {
    pub revision: u64,
    pub status: String,
    pub configured: bool,
    pub refreshing: bool,
    pub stale: bool,
    pub calendar: Option<Calendar>,
    pub authorization: Option<DeviceAuthorization>,
    pub message: Option<String>,
    pub retry_at: Option<u64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GithubDestination {
    Verification,
    Profile,
    Authorization,
}
