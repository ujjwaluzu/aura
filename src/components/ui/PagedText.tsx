import { useState } from 'react';
import { useElementSize } from '../../hooks/useElementSize';
import { PageControls } from './PageControls';
export function PagedText({ text }: { text: string }) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const columns = Math.max(12, Math.floor(width / 7));
  const lines = text
    .split('\n')
    .flatMap((line) =>
      line.length
        ? Array.from({ length: Math.ceil(line.length / columns) }, (_, i) =>
            line.slice(i * columns, (i + 1) * columns),
          )
        : [''],
    );
  const capacity = Math.max(1, Math.floor(height / 18));
  const pages = Math.max(1, Math.ceil(lines.length / capacity));
  const page = Math.min(index, pages - 1);
  return (
    <div className="paged-text">
      <div className="paged-text-body" ref={ref}>
        <pre>
          {lines.slice(page * capacity, (page + 1) * capacity).join('\n')}
        </pre>
      </div>
      <PageControls
        page={page}
        pages={pages}
        onPage={setIndex}
        label="Diagnostic"
      />
    </div>
  );
}
