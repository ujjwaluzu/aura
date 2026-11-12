use std::{
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, RefreshKind, System, MINIMUM_CPU_UPDATE_INTERVAL,
};

use crate::models::{AppError, SystemSnapshot};

/// No worker loop: one lazy sampler is shared by demand-driven commands.
#[derive(Default)]
pub struct SystemMonitor {
    sampler: Mutex<Option<Sampler>>,
}

struct Sampler {
    system: System,
    refreshed_at: Instant,
    snapshot: SystemSnapshot,
}

impl SystemMonitor {
    pub fn snapshot(&self) -> Result<SystemSnapshot, AppError> {
        let mut guard = self.sampler.lock().map_err(|_| unavailable())?;
        let sampler = match guard.as_mut() {
            Some(sampler) => sampler,
            None => {
                let system = System::new_with_specifics(
                    RefreshKind::nothing()
                        .with_cpu(CpuRefreshKind::nothing().with_usage())
                        .with_memory(MemoryRefreshKind::nothing().with_ram()),
                )
                .map_err(|error| {
                    eprintln!("Aura could not initialize system monitoring: {error}");
                    unavailable()
                })?;
                // CPU utilization requires a second, spaced sample. RAM can be
                // shown immediately; CPU stays unavailable during warm-up.
                let snapshot = readings(&system, false);
                *guard = Some(Sampler {
                    system,
                    refreshed_at: Instant::now(),
                    snapshot: snapshot.clone(),
                });
                return Ok(snapshot);
            }
        };

        let elapsed = sampler.refreshed_at.elapsed();
        if elapsed < Duration::from_secs(1).max(MINIMUM_CPU_UPDATE_INTERVAL) {
            return Ok(sampler.snapshot.clone());
        }

        sampler.system.refresh_cpu_usage();
        sampler
            .system
            .refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
        // A resumed widget must not present the average of a long hidden period
        // as current CPU usage. Re-prime the baseline after an idle gap.
        sampler.snapshot = readings(&sampler.system, elapsed <= Duration::from_secs(3));
        sampler.refreshed_at = Instant::now();
        Ok(sampler.snapshot.clone())
    }
}

fn readings(system: &System, cpu_ready: bool) -> SystemSnapshot {
    let cpu = (cpu_ready && !system.cpus().is_empty()).then(|| system.global_cpu_usage());
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    SystemSnapshot::from_readings(cpu, system.used_memory(), system.total_memory(), timestamp)
}

fn unavailable() -> AppError {
    AppError::new(
        "MONITOR_UNAVAILABLE",
        "System usage is unavailable. Please try again.",
    )
}
