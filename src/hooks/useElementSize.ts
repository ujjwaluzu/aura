import { useEffect, useRef, useState } from 'react';
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (
        !entry ||
        entry.contentRect.width <= 0 ||
        entry.contentRect.height <= 0
      )
        return;
      const { width, height } = entry.contentRect;
      setSize((old) =>
        old.width === width && old.height === height ? old : { width, height },
      );
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
