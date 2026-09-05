import React, { useState, useMemo } from "react";

const WIDTH = 300;
const HEIGHT = 100;
const RANGES = [7, 30, 90];

function isoDaysAgo(days, fromIso) {
  const d = new Date(fromIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildDateSequence(startIso, endIso) {
  const dates = [];
  let cursor = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Kleine, abhängigkeitsfreie SVG-Liniengrafik. Datenlücken (Tage ohne
 * Messwert) werden NICHT interpoliert oder als 0 gezeichnet, sondern
 * erzeugen bewusst eine Unterbrechung der Linie (separates Pfad-Segment).
 */
export default function TrendChart({ label, unit, records, accessor, formatValue = (v) => Math.round(v * 10) / 10 }) {
  const [range, setRange] = useState(30);

  const { segments, latestValue, hasAnyData } = useMemo(() => {
    if (records.length === 0) return { segments: [], latestValue: null, hasAnyData: false };

    const endIso = records[records.length - 1].date;
    const startIso = isoDaysAgo(range - 1, endIso);
    const dateSeq = buildDateSequence(startIso, endIso);
    const byDate = new Map(records.map((r) => [r.date, r]));

    const points = dateSeq.map((date) => {
      const record = byDate.get(date);
      const raw = record ? accessor(record) : undefined;
      return { date, value: Number.isFinite(raw) ? raw : undefined };
    });

    const definedValues = points.map((p) => p.value).filter((v) => v !== undefined);
    if (definedValues.length === 0) return { segments: [], latestValue: null, hasAnyData: false };

    const min = Math.min(...definedValues);
    const max = Math.max(...definedValues);
    const span = max - min || 1;
    const xStep = WIDTH / Math.max(dateSeq.length - 1, 1);

    const segs = [];
    let current = [];
    points.forEach((p, i) => {
      if (p.value === undefined) {
        if (current.length > 0) segs.push(current);
        current = [];
        return;
      }
      const x = i * xStep;
      const y = HEIGHT - ((p.value - min) / span) * (HEIGHT - 16) - 8;
      current.push([x, y]);
    });
    if (current.length > 0) segs.push(current);

    const latest = definedValues[definedValues.length - 1];
    return { segments: segs, latestValue: latest, hasAnyData: true };
  }, [records, range, accessor]);

  return (
    <div className="card">
      <p className="card-label">{label}</p>
      <div className="range-toggle">
        {RANGES.map((r) => (
          <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
            {r}T
          </button>
        ))}
      </div>
      {hasAnyData ? (
        <>
          <div className="trend-current-value">
            {formatValue(latestValue)} <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{unit}</span>
          </div>
          <svg className="trend-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            {segments.map((seg, idx) => (
              <polyline
                key={idx}
                points={seg.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Keine Daten in diesem Zeitraum</p>
      )}
    </div>
  );
}
