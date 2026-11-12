import { useLocalTime } from '../../../hooks/useLocalTime';
import type { WidgetProps } from '../../../features/widget-engine/types';

export function ClockWidget({ configuration, themeId }: WidgetProps) {
  const now = useLocalTime();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: configuration.hour12 === true,
  }).format(now);
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  return (
    <section
      className="clock-widget"
      aria-label="Clock"
      data-theme={themeId}
      data-tauri-drag-region
    >
      <time
        className="clock-time"
        dateTime={now.toISOString()}
        aria-label="Current time"
        aria-live="off"
        data-tauri-drag-region
      >
        {time}
      </time>
      <p className="clock-date" data-tauri-drag-region>
        {date}
      </p>
    </section>
  );
}
