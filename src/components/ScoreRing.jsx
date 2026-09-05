import React from "react";

const RADIUS = 43;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Kreisförmiger Fortschrittsring mit Farbverlauf (Whoop-Optik).
 * Der Wert in der Mitte wird bewusst als HTML über dem SVG gerendert statt
 * als <text>, damit Schriftart, Ziffern-Kerning und Farbverläufe exakt dem
 * restlichen UI entsprechen.
 */
export default function ScoreRing({
  id,
  value,
  max = 100,
  colorFrom,
  colorTo,
  label,
  displayValue,
  suffix,
  note,
  thickness = 9,
}) {
  const hasValue = Number.isFinite(value);
  const ratio = hasValue ? Math.max(0, Math.min(1, value / max)) : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div className="ring-card">
      <div className="ring-wrap">
        <svg viewBox="0 0 100 100" style={{ width: "100%", display: "block" }}>
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={thickness} />
          {hasValue && (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={`url(#grad-${id})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          )}
        </svg>
        <div className="ring-center">
          <div className="ring-number" style={{ color: hasValue ? colorTo : "var(--text-faint)" }}>
            {hasValue ? (displayValue ?? Math.round(value)) : "–"}
          </div>
          {suffix && hasValue && <div className="ring-suffix">{suffix}</div>}
        </div>
      </div>
      <div className="ring-label">{label}</div>
      {note && <div className="ring-note">{note}</div>}
    </div>
  );
}
