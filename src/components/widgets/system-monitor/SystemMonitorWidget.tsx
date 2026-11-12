import { Cpu, MemoryStick, RefreshCw } from 'lucide-react';
import { useSystemMonitor } from '../../../hooks/useSystemMonitor';
import type { WidgetProps } from '../../../features/widget-engine/types';
import { IconButton } from '../../ui/IconButton';
import { GlassSurface } from '../../ui/GlassSurface';
import { UsageSparkline } from './UsageSparkline';

function UsageReading({
  label,
  percent,
  detail,
  samples,
}: {
  label: 'CPU' | 'RAM';
  percent: number | null;
  detail?: string;
  samples: readonly (number | null)[];
}) {
  const value = percent === null ? null : Math.max(0, Math.min(100, percent));
  return (
    <GlassSurface
      variant="inset"
      opacity={0.35}
      className="usage-card"
      data-tauri-drag-region
    >
      <div className="usage-heading" data-tauri-drag-region>
        <span className="usage-icon" aria-hidden="true">
          {label === 'CPU' ? (
            <Cpu size={21} strokeWidth={1.5} />
          ) : (
            <MemoryStick size={21} strokeWidth={1.5} />
          )}
        </span>
        <div className="usage-copy" data-tauri-drag-region>
          <span className="usage-label" data-tauri-drag-region>
            {label}
          </span>
          {label === 'RAM' && (
            <span className="usage-detail" data-tauri-drag-region>
              {detail}
            </span>
          )}
        </div>
        <output
          className="usage-value"
          aria-label={`${label} utilization`}
          aria-live="off"
          data-tauri-drag-region
        >
          {value === null ? '—' : `${Math.round(value)}%`}
        </output>
      </div>
      <div
        className="usage-track"
        role={value === null ? undefined : 'meter'}
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? undefined : `${Math.round(value)}%`}
        data-tauri-drag-region
      >
        <UsageSparkline samples={samples} />
      </div>
    </GlassSurface>
  );
}

export function SystemMonitorWidget({ themeId }: WidgetProps) {
  const { snapshot, status, error, retry, history } = useSystemMonitor();
  const memory =
    snapshot?.usedMemoryBytes != null && snapshot.totalMemoryBytes != null
      ? `${(snapshot.usedMemoryBytes / 1024 ** 3).toFixed(1)} / ${(snapshot.totalMemoryBytes / 1024 ** 3).toFixed(1)} GiB`
      : undefined;

  return (
    <section
      className="system-monitor-widget"
      aria-label="System usage"
      data-theme={themeId}
      data-tauri-drag-region
    >
      <UsageReading
        label="CPU"
        percent={snapshot?.cpuPercent ?? null}
        samples={history.map((sample) => sample.cpuPercent)}
      />
      <UsageReading
        label="RAM"
        percent={snapshot?.memoryPercent ?? null}
        samples={history.map((sample) => sample.memoryPercent)}
        {...(memory ? { detail: memory } : {})}
      />
      <span className="sr-only" role="status" aria-label="System monitoring">
        {status === 'preview'
          ? 'System usage is available in the desktop application.'
          : status === 'ready'
            ? 'System monitoring active'
            : status === 'error'
              ? error
              : status === 'paused'
                ? 'System monitoring paused'
                : 'Reading system usage…'}
      </span>
      {status === 'error' && (
        <div className="monitor-error">
          <span title={error ?? undefined}>Unavailable</span>
          <IconButton
            label="Retry system monitoring"
            title={error ?? 'Retry system monitoring'}
            onClick={retry}
          >
            <RefreshCw size={12} />
          </IconButton>
        </div>
      )}
    </section>
  );
}
