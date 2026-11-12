import { useEffect, useState } from 'react';

/** Minute precision: align to the wall clock and suspend while the host is hidden. */
export function useLocalTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        60_000 - (Date.now() % 60_000),
      );
    };
    const refresh = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        schedule();
      }
    };

    if (document.visibilityState === 'visible') schedule();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return now;
}
