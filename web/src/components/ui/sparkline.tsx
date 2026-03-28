"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 200,
  height = 40,
  color = "var(--bg-accent)",
  fill = false,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as [number, number];
  });

  const polylinePoints = pts.map(([x, y]) => `${x},${y}`).join(" ");

  // Area path: line + close down to bottom
  const areaPath = fill
    ? [
        `M ${pts[0][0]},${pts[0][1]}`,
        ...pts.slice(1).map(([x, y]) => `L ${x},${y}`),
        `L ${pts[pts.length - 1][0]},${height}`,
        `L ${pts[0][0]},${height}`,
        "Z",
      ].join(" ")
    : null;

  const gradId = `spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {fill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
    </svg>
  );
}
