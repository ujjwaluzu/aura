import { useId } from 'react';

/** Only actual samples are plotted; null readings split the line into segments. */
export function UsageSparkline({
  samples,
}: {
  samples: readonly (number | null)[];
}) {
  const id = useId();
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] | null = null;
  samples.forEach((sample, index) => {
    if (sample === null) {
      segment = null;
      return;
    }
    if (segment === null) {
      segment = [];
      segments.push(segment);
    }
    segment.push({
      x: samples.length === 1 ? 240 : (index / (samples.length - 1)) * 240,
      y: 40 - (Math.min(100, Math.max(0, sample)) / 100) * 34,
    });
  });
  const lines = segments.map((points) =>
    points
      .map((point, index) => {
        const previous = points[index - 1];
        if (!previous) return `M${point.x},${point.y}`;
        const midpoint = (previous.x + point.x) / 2;
        return `C${midpoint},${previous.y} ${midpoint},${point.y} ${point.x},${point.y}`;
      })
      .join(' '),
  );

  return (
    <svg
      className="usage-sparkline"
      viewBox="0 0 240 46"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--chart-color)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--chart-color)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {segments.map((points, index) => (
        <g key={index}>
          {points.length > 1 && (
            <path
              d={`${lines[index]} L${points.at(-1)!.x},46 L${points[0]!.x},46Z`}
              fill={`url(#${id})`}
            />
          )}
          <path
            d={lines[index]}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
          {points.length === 1 && (
            <circle
              cx={points[0]!.x}
              cy={points[0]!.y}
              r="1.8"
              fill="currentColor"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
