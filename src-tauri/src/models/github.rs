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
    pub account: Option<GithubAccount>,
    pub work_permission: bool,
    pub work: Vec<WorkCategoryState>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubAccount {
    pub account_id: String,
    pub login: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkCategory {
    Reviews,
    MyPrs,
    FailingPrs,
    Issues,
}
impl WorkCategory {
    pub const ALL: [Self; 4] = [Self::Reviews, Self::MyPrs, Self::FailingPrs, Self::Issues];
    pub fn index(self) -> usize {
        Self::ALL.iter().position(|c| *c == self).unwrap()
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItem {
    pub id: String,
    pub title: String,
    pub repository: String,
    pub number: u32,
    pub updated_at: String,
    pub draft: bool,
    pub review_decision: Option<String>,
    pub checks: Option<String>,
    pub private: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCategoryState {
    pub category: WorkCategory,
    pub status: String,
    pub count: Option<u32>,
    pub items: Vec<WorkItem>,
    pub cursor: Option<String>,
    pub has_next_page: bool,
    pub limited: bool,
    pub loading: bool,
    pub stale: bool,
    pub updated_at: Option<u64>,
    pub message: Option<String>,
}
pub fn empty_work(permitted: bool) -> Vec<WorkCategoryState> {
    WorkCategory::ALL
        .into_iter()
        .map(|category| WorkCategoryState {
            category,
            status: if permitted { "loading" } else { "permission" }.into(),
            count: None,
            items: vec![],
            cursor: None,
            has_next_page: false,
            limited: false,
            loading: false,
            stale: false,
            updated_at: None,
            message: None,
        })
        .collect()
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GithubDestination {
    Verification,
    Profile,
    Authorization,
}
