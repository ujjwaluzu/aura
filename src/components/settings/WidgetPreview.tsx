import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pause, SkipBack, SkipForward } from 'lucide-react';
import type {
  LayoutDefinition,
  LayoutModule,
} from '../../features/layouts/catalog';
import { WidgetArrangement } from '../../features/layouts/WidgetArrangement';
import type { ThemeId } from '../../features/themes/catalog';
import { PlayerPresentation } from '../music/PlayerPresentation';
import { UsageReading } from '../widgets/system-monitor/SystemMonitorWidget';
import type { PlaybackSession } from '../../types/music';
const sample: PlaybackSession = {
  id: 'preview',
  source: 'YouTube',
  title: 'A moment of calm',
  artist: 'Aura sessions',
  playing: true,
  positionSeconds: 80,
  durationSeconds: 240,
  updatedAtUnixMs: 0,
  artwork: null,
  canPlay: true,
  canPause: true,
  canPrevious: true,
  canNext: true,
  canSeek: true,
};
export function WidgetPreview({
  theme,
  layout,
}: {
  theme: ThemeId;
  layout: LayoutDefinition;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(210);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(entry.contentRect.width);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const render = (module: LayoutModule) =>
    module === 'clock' ? (
      <section className="clock-widget">
        <span className="clock-time">10:08</span>
        <p className="clock-date">Friday 13 November</p>
      </section>
    ) : module === 'stats' ? (
      <section className="system-monitor-widget">
        <UsageReading label="CPU" percent={24} samples={[10, 30, 24, 45, 24]} />
        <UsageReading
          label="RAM"
          percent={48}
          detail="7.7 / 16.0 GiB"
          samples={[46, 46, 47, 48, 48]}
        />
      </section>
    ) : (
      <div className="glass-surface glass-inset music-connect-card">
        <PlayerPresentation
          session={sample}
          presentation={
            layout.focus
              ? 'focus'
              : layout.primary === 'music'
                ? 'vertical'
                : 'horizontal'
          }
          progress={<div className="preview-progress" />}
          controls={
            <>
              <span className="music-transport">
                <SkipBack size={15} />
                <Pause size={15} />
                <SkipForward size={15} />
              </span>
              <MoreHorizontal size={16} />
            </>
          }
        />
      </div>
    );
  return (
    <div
      className="widget-preview"
      ref={ref}
      style={{ height: (width * 244) / 740 }}
      aria-hidden="true"
    >
      <div
        className="host-surface"
        data-theme={theme}
        data-primary={layout.primary}
        data-side={layout.side}
        data-focus={layout.focus ? 'music' : undefined}
        style={{
          width: 740,
          transform: `scale(${width / 740})`,
          transformOrigin: 'top left',
        }}
      >
        <WidgetArrangement layout={layout} render={render} />
      </div>
    </div>
  );
}
