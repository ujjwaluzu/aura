import { AudioLines, Clock3, Cpu } from 'lucide-react';
import type {
  LayoutDefinition,
  LayoutModule,
} from '../../features/layouts/catalog';
import type { ThemeId } from '../../features/themes/catalog';

function PreviewBlock({ module }: { module: LayoutModule }) {
  return (
    <div className={`preview-block preview-${module}`}>
      {module === 'clock' ? (
        <>
          <Clock3 size={13} />
          <span>Clock</span>
          <b>10:08</b>
        </>
      ) : module === 'stats' ? (
        <>
          <Cpu size={13} />
          <span>CPU / RAM</span>
          <i />
          <i />
        </>
      ) : (
        <>
          <AudioLines size={15} />
          <span>Music</span>
          <i />
        </>
      )}
    </div>
  );
}

/** A schematic thumbnail, not another running widget or system sampler. */
export function WidgetPreview({
  theme,
  layout,
}: {
  theme: ThemeId;
  layout: LayoutDefinition;
}) {
  return (
    <div
      className="widget-preview"
      data-theme={theme}
      data-side={layout.side}
      aria-hidden="true"
    >
      <div className="preview-primary">
        <PreviewBlock module={layout.primary} />
      </div>
      <div className="preview-stack">
        <PreviewBlock module={layout.top} />
        <PreviewBlock module={layout.bottom} />
      </div>
    </div>
  );
}
