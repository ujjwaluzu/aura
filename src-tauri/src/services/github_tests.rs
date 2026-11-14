#[cfg(all(test, windows))]
mod tests {
    use super::super::github_api::Tokens;
    use super::*;
    use std::{collections::VecDeque, sync::Barrier};

    #[derive(Default)]
    struct Script {
        polls: VecDeque<Result<Poll, Failure>>,
        calendars: VecDeque<Result<Calendar, Failure>>,
        calls: Vec<&'static str>,
        work: VecDeque<Result<WorkCategoryState, Failure>>,
        identities: VecDeque<Result<GithubAccount, Failure>>,
        work_gate: Option<Arc<Barrier>>,
        rotate_gate: Option<Arc<Barrier>>,
        gate: Option<Arc<Barrier>>,
    }
    struct Fake(Arc<Mutex<Script>>);
    fn tokens() -> Tokens {
        Tokens {
            access: "fixture-access".into(),
            scopes: vec!["read:user".into()],
            refresh: Some("fixture-refresh".into()),
            expires_at: None,
            refresh_expires_at: None,
        }
    }
    fn calendar(count: u32) -> Calendar {
        Calendar {
            account_id: "U_fixture".into(),
            login: "octocat".into(),
            total_contributions: count,
            weeks: vec![ContributionWeek {
                contribution_days: vec![ContributionDay {
                    date: "2028-02-29".into(),
                    weekday: 2,
                    contribution_count: count,
                    contribution_level: "THIRD_QUARTILE".into(),
                }],
            }],
            updated_at: 1000,
        }
    }
    impl GithubApi for Fake {
        fn identity(&self, _: &Tokens, _: u64) -> Result<GithubAccount, Failure> {
            self.0
                .lock()
                .unwrap()
                .identities
                .pop_front()
                .unwrap_or_else(|| {
                    Ok(GithubAccount {
                        account_id: "U_fixture".into(),
                        login: "octocat".into(),
                    })
                })
        }
        fn work(
            &self,
            _: &Tokens,
            _: &str,
            c: WorkCategory,
            _: Option<&str>,
            time: u64,
        ) -> Result<WorkCategoryState, Failure> {
            let gate = self.0.lock().unwrap().work_gate.clone();
            if let Some(gate) = gate {
                gate.wait();
                gate.wait();
            }
            let mut s = self.0.lock().unwrap();
            s.calls.push("work");
            s.work.pop_front().unwrap_or_else(|| {
                let mut cache = empty_work(true)[c.index()].clone();
                cache.status = "empty".into();
                cache.count = Some(0);
                cache.updated_at = Some(time);
                Ok(cache)
            })
        }

        fn device(&self, _: &str, now: u64) -> Result<DeviceCode, Failure> {
            let gate = {
                let mut s = self.0.lock().unwrap();
                s.calls.push("device");
                s.gate.clone()
            };
            if let Some(gate) = gate {
                gate.wait();
                gate.wait();
            }
            Ok(DeviceCode {
                device_code: "secret-device".into(),
                user_code: "ABCD-EFGH".into(),
                expires_at: now + 900,
                interval: 5,
            })
        }
        fn poll(&self, _: &str, _: &DeviceCode, _: u64) -> Result<Poll, Failure> {
            let mut s = self.0.lock().unwrap();
            s.calls.push("poll");
            s.polls.pop_front().unwrap_or(Ok(Poll::Pending))
        }
        fn rotate(&self, _: &str, _: &Tokens, _: u64) -> Result<Tokens, Failure> {
            let gate = self.0.lock().unwrap().rotate_gate.clone();
            if let Some(gate) = gate {
                gate.wait();
                gate.wait();
            }
            let mut s = self.0.lock().unwrap();
            s.calls.push("rotate");
            let mut t = tokens();
            t.access = "rotated-access".into();
            t.refresh = Some("rotated-refresh".into());
            Ok(t)
        }
        fn calendar(&self, _: &Tokens, _: u64) -> Result<Calendar, Failure> {
            let mut s = self.0.lock().unwrap();
            s.calls.push("calendar");
            s.calendars.pop_front().unwrap_or_else(|| Ok(calendar(3)))
        }
    }
    struct Fixture {
        service: Arc<GithubService>,
        script: Arc<Mutex<Script>>,
        dir: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "aura-github-test-{}-{}",
                std::process::id(),
                rand::random::<u64>()
            ));
            let script = Arc::new(Mutex::new(Script::default()));
            let service = Arc::new(GithubService::with_api(
                Some(dir.clone()),
                "fixtureClient".into(),
                Box::new(Fake(script.clone())),
                Box::new(|_| {}),
            ));
            Self {
                service,
                script,
                dir,
            }
        }
        fn connect(&self) {
            self.script
                .lock()
                .unwrap()
                .polls
                .push_back(Ok(Poll::Authorized(tokens())));
            self.service.start_authorization().unwrap();
            assert!(self.service.step(1000));
            assert!(!self.service.step(1004));
            assert!(self.service.step(1005));
            assert!(self.service.step(1005));
            assert!(self.service.step(1005));
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.service.vault.clear();
            let _ = std::fs::remove_dir(&self.dir);
        }
    }
    #[test]
    fn approval_fetches_immediately_then_auto_and_manual_refresh_update_zero_to_three() {
        let f = Fixture::new();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Ok(calendar(0)));
        f.connect();
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 0);
        assert!(!f.service.step(1304));
        assert!(f.service.step(1305));
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 3);
        f.service.refresh(false);
        assert!(f.service.step(1305));
        assert_eq!(
            f.script
                .lock()
                .unwrap()
                .calls
                .iter()
                .filter(|s| **s == "calendar")
                .count(),
            3
        );
    }
    #[test]
    fn polling_pending_slowdown_denial_expiry_and_retry() {
        let f = Fixture::new();
        f.script.lock().unwrap().polls.extend([
            Ok(Poll::Pending),
            Ok(Poll::SlowDown(10)),
            Err(Failure::Denied),
        ]);
        f.service.start_authorization().unwrap();
        f.service.step(1000);
        f.service.step(1005);
        f.service.step(1010);
        assert!(!f.service.step(1019));
        f.service.step(1020);
        assert_eq!(f.service.status().status, "failed");
        assert!(f.service.status().authorization.is_none());
        f.service.start_authorization().unwrap();
        f.service.step(2000);
        f.service.step(2900);
        assert!(f.service.status().message.unwrap().contains("expired"));
    }
    #[test]
    fn cancel_during_http_prevents_late_code_and_overlapping_work() {
        let f = Fixture::new();
        let gate = Arc::new(Barrier::new(2));
        f.script.lock().unwrap().gate = Some(gate.clone());
        f.service.start_authorization().unwrap();
        let service = f.service.clone();
        let thread = std::thread::spawn(move || service.step(1000));
        gate.wait();
        assert!(!f.service.step(1000));
        f.service.cancel();
        gate.wait();
        thread.join().unwrap();
        assert_eq!(f.service.status().status, "disconnected");
        assert!(f.service.status().authorization.is_none());
        assert!(f.service.vault.load("fixtureClient").unwrap().is_none());
    }
    #[test]
    fn token_rotation_is_saved_even_if_calendar_is_offline() {
        let f = Fixture::new();
        f.connect();
        f.service.lock().account.as_mut().unwrap().tokens.expires_at = Some(1006);
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(None)));
        f.service.step(1305);
        let saved = f.service.vault.load("fixtureClient").unwrap().unwrap();
        assert_eq!(saved.tokens.refresh.as_deref(), Some("rotated-refresh"));
        assert_eq!(saved.tokens.access, "rotated-access");
        assert!(f.service.status().stale);
        assert_eq!(f.service.status().calendar.unwrap().total_contributions, 3);
    }
    #[test]
    fn rate_limit_cannot_be_bypassed_by_manual_refresh() {
        let f = Fixture::new();
        f.connect();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(Some(5000))));
        f.service.step(1305);
        f.service.refresh(false);
        assert!(!f.service.step(4999));
        assert!(f.service.step(5000));
        assert!(!f.service.status().stale);
    }
    #[test]
    fn offline_restart_uses_account_bound_cache_and_refreshes_on_startup() {
        let f = Fixture::new();
        f.connect();
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(None)));
        let service = GithubService::with_api(
            Some(f.dir.clone()),
            "fixtureClient".into(),
            Box::new(Fake(f.script.clone())),
            Box::new(|_| {}),
        );
        assert!(service.status().stale);
        assert_eq!(service.status().calendar.unwrap().login, "octocat");
        assert!(service.step(2000));
        assert!(service.status().stale);
        let changed = GithubService::with_api(
            Some(f.dir.clone()),
            "otherClient".into(),
            Box::new(Fake(f.script.clone())),
            Box::new(|_| {}),
        );
        assert_eq!(changed.status().status, "reconnectRequired");
        assert!(changed.status().calendar.is_none());
    }
    #[test]
    fn changed_identity_never_reuses_cache_and_disconnect_clears_disk() {
        let f = Fixture::new();
        f.connect();
        let mut other = calendar(7);
        other.account_id = "U_other".into();
        f.script.lock().unwrap().calendars.push_back(Ok(other));
        f.service.step(1305);
        assert_eq!(f.service.status().status, "reconnectRequired");
        assert!(f.service.status().calendar.is_none());
        f.service.disconnect().unwrap();
        assert!(f.service.vault.load("fixtureClient").unwrap().is_none());
        assert!(!f.service.step(9000));
    }
    #[test]
    fn encrypted_record_and_ipc_do_not_expose_tokens() {
        let f = Fixture::new();
        f.connect();
        let bytes = std::fs::read(f.dir.join("github-account.bin")).unwrap();
        assert!(!bytes.windows(14).any(|w| w == b"fixture-access"));
        let ipc = serde_json::to_string(&f.service.status()).unwrap();
        assert!(
            !ipc.contains("fixture-access")
                && !ipc.contains("fixture-refresh")
                && !ipc.contains("secret-device")
        );
        std::fs::write(f.dir.join("github-account.tmp"), b"encrypted-remnant").unwrap();
        f.service.disconnect().unwrap();
        assert!(!f.dir.join("github-account.bin").exists());
        assert!(!f.dir.join("github-account.tmp").exists());
    }
    #[test]
    fn fixed_destinations_do_not_accept_external_urls() {
        let f = Fixture::new();
        f.connect();
        assert_eq!(
            f.service.destination(GithubDestination::Profile).unwrap(),
            "https://github.com/octocat"
        );
        assert!(serde_json::from_str::<GithubDestination>("\"https://evil.example\"").is_err());
        assert_eq!(
            f.service
                .destination(GithubDestination::Authorization)
                .unwrap(),
            "https://github.com/settings/connections/applications/fixtureClient"
        );
    }
    fn enable_work(f: &Fixture) {
        let mut i = f.service.lock();
        i.account
            .as_mut()
            .unwrap()
            .tokens
            .scopes
            .push("repo".into());
        i.view.work_permission = true;
        i.view.work = empty_work(true);
        f.service.vault.save(i.account.as_ref().unwrap()).unwrap();
    }
    fn result_page(c: WorkCategory, from: u32, count: u32, next: bool) -> WorkCategoryState {
        let mut page = empty_work(true)[c.index()].clone();
        page.count = Some(count);
        page.status = if count == 0 { "empty" } else { "ready" }.into();
        page.updated_at = Some(1005);
        page.cursor = Some(format!("cursor-{from}"));
        page.has_next_page = next;
        page.items = (from..(from + 30).min(count))
            .map(|n| WorkItem {
                id: format!("PR_{n}"),
                title: format!("Private work item {n}"),
                repository: "team/private-repo".into(),
                number: n + 1,
                updated_at: "2026-11-14T00:00:00Z".into(),
                draft: false,
                review_decision: None,
                checks: None,
                private: true,
            })
            .collect();
        page
    }
    #[test]
    fn upgrade_denial_cancel_and_failed_identity_preserve_credentials_calendar_and_scopes() {
        let f = Fixture::new();
        f.connect();
        f.service.start_authorization().unwrap();
        assert!(f.service.status().account.is_some());
        assert!(f
            .service
            .vault
            .load("fixtureClient")
            .unwrap()
            .unwrap()
            .calendar
            .is_some());
        f.service.cancel();
        assert_eq!(f.service.status().status, "connected");
        f.service.start_authorization().unwrap();
        f.service.step(2000);
        f.script
            .lock()
            .unwrap()
            .polls
            .push_back(Err(Failure::Denied));
        f.service.step(2005);
        assert_eq!(f.service.status().status, "connected");
        assert!(!f.service.status().work_permission);
        f.service.start_authorization().unwrap();
        f.service.step(3000);
        f.script
            .lock()
            .unwrap()
            .polls
            .push_back(Ok(Poll::Authorized(tokens())));
        f.service.step(3005);
        f.script
            .lock()
            .unwrap()
            .identities
            .push_back(Err(Failure::InvalidData));
        f.service.step(3005);
        let saved = f.service.vault.load("fixtureClient").unwrap().unwrap();
        assert_eq!(saved.tokens.access, "fixture-access");
        assert!(saved.calendar.is_some());
        assert_eq!(f.service.status().status, "connected");
    }
    #[test]
    fn successful_upgrade_enables_shared_work_and_different_account_discards_all_previous_caches() {
        let f = Fixture::new();
        f.connect();
        f.service.start_authorization().unwrap();
        f.service.step(2000);
        let mut t = tokens();
        t.scopes.push("repo".into());
        f.script
            .lock()
            .unwrap()
            .polls
            .push_back(Ok(Poll::Authorized(t)));
        f.service.step(2005);
        f.service.step(2005);
        assert!(f.service.status().work_permission);
        assert!(f.service.status().calendar.is_some());
        f.service.step(2005);
        f.service.step(2005);
        assert_eq!(
            f.script
                .lock()
                .unwrap()
                .calls
                .iter()
                .filter(|c| **c == "device")
                .count(),
            2
        );
        f.service.start_authorization().unwrap();
        f.service.step(3000);
        f.script
            .lock()
            .unwrap()
            .polls
            .push_back(Ok(Poll::Authorized(tokens())));
        f.service.step(3005);
        f.script
            .lock()
            .unwrap()
            .identities
            .push_back(Ok(GithubAccount {
                account_id: "U_other".into(),
                login: "other".into(),
            }));
        f.service.step(3005);
        let state = f.service.status();
        assert!(state.calendar.is_none());
        assert!(state.work.iter().all(|c| c.items.is_empty()));
        assert_eq!(state.account.unwrap().account_id, "U_other");
    }
    #[test]
    fn work_and_activity_refresh_independently_and_unavailable_counts_are_not_zero() {
        let f = Fixture::new();
        f.connect();
        enable_work(&f);
        f.script
            .lock()
            .unwrap()
            .work
            .push_back(Err(Failure::Temporary(None)));
        for _ in 0..4 {
            assert!(f.service.step(1005));
        }
        let state = f.service.status();
        assert_eq!(state.work[0].count, None);
        assert_eq!(state.work[1].count, Some(0));
        assert!(state.calendar.is_some());
        f.script
            .lock()
            .unwrap()
            .calendars
            .push_back(Err(Failure::Temporary(None)));
        assert!(f.service.step(1305)); // Activity fails; Work still refreshes.
        assert!(f.service.step(1305));
        assert_eq!(f.service.status().work[0].status, "empty");
        assert!(f.service.status().stale);
    }
    #[test]
    fn work_cursor_pages_cache_encrypted_private_records_and_native_destinations() {
        let f = Fixture::new();
        f.connect();
        enable_work(&f);
        f.script.lock().unwrap().work.push_back(Ok(result_page(
            WorkCategory::Reviews,
            0,
            34,
            true,
        )));
        for _ in 0..4 {
            f.service.step(1005);
        }
        f.script.lock().unwrap().work.push_back(Ok(result_page(
            WorkCategory::Reviews,
            30,
            34,
            false,
        )));
        f.service
            .refresh_work(false, Some(WorkCategory::Reviews), true);
        f.service.step(1005);
        let state = f.service.status();
        assert_eq!(state.work[0].items.len(), 34);
        assert!(!state.work[0].has_next_page);
        assert!(f
            .service
            .work_destination(WorkCategory::Reviews, Some("https://evil.example".into()))
            .is_err());
        assert_eq!(
            f.service
                .work_destination(WorkCategory::Reviews, Some("PR_0".into()))
                .unwrap(),
            "https://github.com/team/private-repo/pull/1"
        );
        assert!(f
            .service
            .work_destination(WorkCategory::Issues, None)
            .unwrap()
            .contains("assignee%3Aoctocat"));
        let bytes = std::fs::read(f.dir.join("github-account.bin")).unwrap();
        assert!(!bytes.windows(17).any(|w| w == b"Private work item"));
        let restored = GithubService::with_api(
            Some(f.dir.clone()),
            "fixtureClient".into(),
            Box::new(Fake(f.script.clone())),
            Box::new(|_| {}),
        );
        assert_eq!(restored.status().work[0].items.len(), 34);
        assert!(restored.status().work[0].stale);
        f.service.disconnect().unwrap();
        assert!(f.service.status().work.iter().all(|c| c.items.is_empty()));
    }
    #[test]
    fn work_permission_and_rate_limits_preserve_successful_data_and_share_cooldown() {
        let f = Fixture::new();
        f.connect();
        enable_work(&f);
        f.script.lock().unwrap().work.push_back(Ok(result_page(
            WorkCategory::Reviews,
            0,
            2,
            false,
        )));
        for _ in 0..4 {
            f.service.step(1005);
        }
        f.script
            .lock()
            .unwrap()
            .work
            .push_back(Err(Failure::Temporary(Some(5000))));
        f.service
            .refresh_work(false, Some(WorkCategory::Reviews), false);
        f.service.step(1006);
        assert!(f.service.status().work[0].stale);
        assert_eq!(f.service.status().work[0].count, Some(2));
        f.service.refresh(false);
        f.service.refresh_work(false, None, false);
        assert!(!f.service.step(4999));
        assert!(f.service.step(5000));
        f.script
            .lock()
            .unwrap()
            .work
            .push_back(Err(Failure::Permission));
        f.service.step(5000);
        assert_eq!(f.service.status().work[0].status, "permission");
        assert!(f.service.status().calendar.is_some());
    }
    #[test]
    fn cancel_disconnect_during_work_cannot_restore_private_cache() {
        let f = Fixture::new();
        f.connect();
        enable_work(&f);
        let gate = Arc::new(Barrier::new(2));
        f.script.lock().unwrap().work_gate = Some(gate.clone());
        let service = f.service.clone();
        let thread = std::thread::spawn(move || service.step(1005));
        gate.wait();
        assert!(!f.service.step(1005));
        f.service.disconnect().unwrap();
        gate.wait();
        thread.join().unwrap();
        assert!(f.service.vault.load("fixtureClient").unwrap().is_none());
        assert!(f.service.status().work.iter().all(|c| c.items.is_empty()));
    }
    #[test]
    fn version_one_encrypted_record_migrates_without_losing_calendar_or_credentials() {
        let f = Fixture::new();
        f.connect();
        let mut legacy =
            serde_json::to_value(f.service.vault.load("fixtureClient").unwrap().unwrap()).unwrap();
        let object = legacy.as_object_mut().unwrap();
        object.insert("version".into(), serde_json::json!(1));
        object.remove("identity");
        object.remove("work");
        object["tokens"].as_object_mut().unwrap().remove("scopes");
        let protected =
            super::super::music_vault::protect(&serde_json::to_vec(&legacy).unwrap()).unwrap();
        std::fs::write(f.dir.join("github-account.bin"), protected).unwrap();
        let migrated = f.service.vault.load("fixtureClient").unwrap().unwrap();
        assert_eq!(migrated.version, 2);
        assert_eq!(migrated.identity.unwrap().login, "octocat");
        assert_eq!(migrated.tokens.access, "fixture-access");
        assert!(migrated.calendar.is_some());
        assert!(migrated.tokens.scopes.is_empty());
    }
    #[test]
    fn identity_retry_keeps_new_tokens_pending_without_repolling_or_replacing_old_credentials() {
        let f = Fixture::new();
        f.connect();
        f.service.start_authorization().unwrap();
        f.service.step(2000);
        let mut t = tokens();
        t.access = "new-pending-token".into();
        f.script
            .lock()
            .unwrap()
            .polls
            .push_back(Ok(Poll::Authorized(t)));
        f.service.step(2005);
        f.script
            .lock()
            .unwrap()
            .identities
            .push_back(Err(Failure::Temporary(None)));
        f.service.step(2005);
        assert_eq!(
            f.service
                .vault
                .load("fixtureClient")
                .unwrap()
                .unwrap()
                .tokens
                .access,
            "fixture-access"
        );
        f.service.step(2035);
        assert_eq!(
            f.service
                .vault
                .load("fixtureClient")
                .unwrap()
                .unwrap()
                .tokens
                .access,
            "new-pending-token"
        );
        assert_eq!(
            f.script
                .lock()
                .unwrap()
                .calls
                .iter()
                .filter(|c| **c == "poll")
                .count(),
            2
        );
    }
    #[test]
    fn upgrading_and_canceling_during_rotation_preserve_new_tokens_but_disconnect_never_restores_them(
    ) {
        for disconnect in [false, true] {
            let f = Fixture::new();
            f.connect();
            f.service.lock().account.as_mut().unwrap().tokens.expires_at = Some(1006);
            let gate = Arc::new(Barrier::new(2));
            f.script.lock().unwrap().rotate_gate = Some(gate.clone());
            let service = f.service.clone();
            let thread = std::thread::spawn(move || service.step(1305));
            gate.wait();
            if disconnect {
                f.service.disconnect().unwrap();
            } else {
                f.service.start_authorization().unwrap();
                f.service.cancel();
            }
            gate.wait();
            thread.join().unwrap();
            let saved = f.service.vault.load("fixtureClient").unwrap();
            if disconnect {
                assert!(saved.is_none());
                assert!(f.service.status().account.is_none());
            } else {
                assert_eq!(saved.unwrap().tokens.access, "rotated-access");
                assert_eq!(f.service.status().status, "connected");
            }
        }
    }
}
