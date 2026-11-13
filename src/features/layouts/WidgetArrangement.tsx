import type { ReactNode } from 'react';
import type { LayoutDefinition, LayoutModule } from './catalog';
export function WidgetArrangement({
  layout,
  render,
}: {
  layout: LayoutDefinition;
  render: (module: LayoutModule) => ReactNode;
}) {
  return layout.focus ? (
    <>
      <div className="focus-clock-slot">{render('clock')}</div>
      <div className="widget-divider" aria-hidden="true" />
      <div className="focus-music-slot">{render('music')}</div>
    </>
  ) : (
    <>
      <div className="primary-slot">{render(layout.primary)}</div>
      <div className="widget-divider" aria-hidden="true" />
      <div className="host-modules">
        <div className="secondary-slot" data-module={layout.top}>
          {render(layout.top)}
        </div>
        <div className="secondary-slot" data-module={layout.bottom}>
          {render(layout.bottom)}
        </div>
      </div>
    </>
  );
}
