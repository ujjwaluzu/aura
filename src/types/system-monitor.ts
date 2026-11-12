export interface SystemSnapshot {
  /** Null while the CPU baseline warms up or when a reading is unavailable. */
  cpuPercent: number | null;
  memoryPercent: number | null;
  usedMemoryBytes: number | null;
  totalMemoryBytes: number | null;
  sampledAtUnixMs: number;
}
