use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu_percent: Option<f32>,
    pub memory_percent: Option<f32>,
    pub used_memory_bytes: Option<u64>,
    pub total_memory_bytes: Option<u64>,
    pub sampled_at_unix_ms: u64,
}

impl SystemSnapshot {
    pub fn from_readings(cpu: Option<f32>, used: u64, total: u64, timestamp: u64) -> Self {
        let memory = (total > 0).then(|| used.min(total));
        Self {
            cpu_percent: cpu
                .filter(|value| value.is_finite())
                .map(|value| value.clamp(0.0, 100.0)),
            memory_percent: memory.map(|used| ((used as f64 / total as f64) * 100.0) as f32),
            used_memory_bytes: memory,
            total_memory_bytes: (total > 0).then_some(total),
            sampled_at_unix_ms: timestamp,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_real_readings_and_serializes_the_frontend_contract() {
        let sample = SystemSnapshot::from_readings(Some(12.5), 6_000, 16_000, 123);
        let json = serde_json::to_value(sample).unwrap();
        assert_eq!(json["cpuPercent"], 12.5);
        assert_eq!(json["memoryPercent"], 37.5);
        assert_eq!(json["usedMemoryBytes"], 6_000);
        assert_eq!(json["totalMemoryBytes"], 16_000);
        assert_eq!(json["sampledAtUnixMs"], 123);
    }

    #[test]
    fn unavailable_readings_are_null_instead_of_a_fake_zero() {
        let sample = SystemSnapshot::from_readings(None, 0, 0, 123);
        let json = serde_json::to_value(sample).unwrap();
        assert!(json["cpuPercent"].is_null());
        assert!(json["memoryPercent"].is_null());
        assert!(json["usedMemoryBytes"].is_null());
        assert!(json["totalMemoryBytes"].is_null());
    }

    #[test]
    fn invalid_readings_never_produce_nan_or_a_bar_over_one_hundred_percent() {
        let sample = SystemSnapshot::from_readings(Some(f32::NAN), 20, 10, 123);
        assert_eq!(sample.cpu_percent, None);
        assert_eq!(sample.memory_percent, Some(100.0));
        assert_eq!(sample.used_memory_bytes, Some(10));
        assert_eq!(
            SystemSnapshot::from_readings(Some(102.0), 0, 10, 123).cpu_percent,
            Some(100.0)
        );
    }
}
