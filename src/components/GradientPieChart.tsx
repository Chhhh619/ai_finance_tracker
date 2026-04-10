interface Segment {
  percentage: number;
  color: string;
}

interface GradientPieChartProps {
  segments: Segment[];
  size?: number;
}

export default function GradientPieChart({ segments, size = 220 }: GradientPieChartProps) {
  const filteredSegments = segments.filter((s) => s.percentage > 0);
  if (filteredSegments.length === 0) {
    return (
      <div
        className="rounded-full bg-gray-100"
        style={{ width: size, height: size }}
      />
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const blurRadius = size * 0.08;

  // Build conic gradient stops with overlap for blur blending
  let cumulative = 0;
  const conicStops: string[] = [];

  filteredSegments.forEach((seg, i) => {
    const start = cumulative;
    const end = cumulative + seg.percentage;
    const startDeg = (start / 100) * 360;
    const endDeg = (end / 100) * 360;

    if (i === 0) {
      conicStops.push(`${seg.color} ${startDeg}deg`);
    }
    conicStops.push(`${seg.color} ${endDeg}deg`);

    cumulative = end;
  });

  const conicGradient = `conic-gradient(from 0deg, ${conicStops.join(", ")})`;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Base conic gradient circle */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: conicGradient,
          filter: `blur(${blurRadius}px)`,
        }}
      />

      {/* Sharper overlay for definition */}
      <div
        className="absolute rounded-full"
        style={{
          inset: blurRadius * 0.5,
          background: conicGradient,
          filter: `blur(${blurRadius * 0.3}px)`,
          opacity: 0.7,
        }}
      />

      {/* Glow effect */}
      <div
        className="absolute rounded-full opacity-30"
        style={{
          inset: -blurRadius,
          background: conicGradient,
          filter: `blur(${blurRadius * 2.5}px)`,
        }}
      />

      {/* SVG overlay for percentage labels */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
      >
        {filteredSegments.map((seg, i) => {
          // Place label at midpoint of each segment
          let startAngle = 0;
          for (let j = 0; j < i; j++) {
            startAngle += filteredSegments[j].percentage;
          }
          const midPercent = startAngle + seg.percentage / 2;
          const midAngle = ((midPercent / 100) * 360 - 90) * (Math.PI / 180);
          const labelR = radius * 0.65;
          const lx = cx + labelR * Math.cos(midAngle);
          const ly = cy + labelR * Math.sin(midAngle);

          if (seg.percentage < 5) return null;

          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={seg.percentage > 15 ? 14 : 12}
              fontWeight={600}
              style={{
                textShadow: "0 1px 4px rgba(0,0,0,0.4)",
              }}
            >
              {Math.round(seg.percentage)}%
            </text>
          );
        })}
      </svg>
    </div>
  );
}
