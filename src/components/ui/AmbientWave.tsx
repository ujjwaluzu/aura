import { useId } from 'react';

/** Static decoration stays inside the transparent host; it is not wallpaper. */
export function AmbientWave() {
  const id = useId();
  return (
    <svg
      className="ambient-wave"
      viewBox="0 0 1100 364"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-wave`} x1="0" y1="0" x2="1" y2="0.7">
          <stop stopColor="#dc8af2" stopOpacity="0.36" />
          <stop offset="0.45" stopColor="#9a5be5" stopOpacity="0.14" />
          <stop offset="1" stopColor="#7258db" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#e2a1f1" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="#a77ae1" stopOpacity="0.22" />
          <stop offset="1" stopColor="#a77ae1" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-10%" y="-100%" width="120%" height="300%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <path
        d="M0 247 C75 218 102 312 177 298 S274 356 352 327 S447 291 520 330 S634 349 721 327 L1100 364 H0Z"
        fill={`url(#${id}-wave)`}
      />
      <path
        d="M0 247 C75 218 102 312 177 298 S274 356 352 327 S447 291 520 330 S634 349 721 327"
        fill="none"
        stroke={`url(#${id}-edge)`}
        strokeWidth="13"
        filter={`url(#${id}-blur)`}
      />
      <path
        d="M0 247 C75 218 102 312 177 298 S274 356 352 327 S447 291 520 330 S634 349 721 327"
        fill="none"
        stroke={`url(#${id}-edge)`}
        strokeWidth="1"
      />
    </svg>
  );
}
