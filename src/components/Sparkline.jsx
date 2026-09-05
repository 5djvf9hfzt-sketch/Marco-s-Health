import React from "react";

const WIDTH = 62;
const HEIGHT = 26;

/**
 * Winzige Verlaufslinie für die Metrik-Kacheln. Fehlende Tage werden
 * übersprungen (kein Nullwert), es entsteht bewusst eine Lücke in der Linie.
 */
export default function Sparkline({ values, color = "var(--text-dim)" }) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return <div className="sparkline" />;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const step = WIDTH / Math.max(values.length - 1, 1);

  const segments = [];
  let current = [];
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    const x = index * step;
    const y = HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 5);
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current);

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      {segments.map((points, index) => (
        <polyline
          key={index}
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
