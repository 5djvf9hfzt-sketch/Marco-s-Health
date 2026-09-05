import React, { useMemo } from "react";

const WIDTH = 300;
const HEIGHT = 108;
const PAD_Y = 10;

function isoDaysAgo(days, fromIso) {
  const d = new Date(fromIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildDateSequence(startIso, endIso) {
  const dates = [];
  const cursor = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function format(value, decimals) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Flächen-Verlaufsdiagramm für eine Metrik über den gewählten Zeitraum.
 * Datenlücken werden NICHT interpoliert: fehlende Tage unterbrechen die Linie,
 * damit ein nicht getragenes Gerät nicht wie ein echter Messwert aussieht.
 */
export default function TrendChart({ id, label, unit, records, accessor, decimals = 0, color, rangeDays }) {
  const chart = useMemo(() => {
    if (records.length === 0) return null;

    const endIso = records[records.length - 1].date;
    const startIso = isoDaysAgo(rangeDays - 1, endIso);
    const dates = buildDateSequence(startIso, endIso);
    const byDate = new Map(records.map((r) => [r.date, r]));

    const points = dates.map((date) => {
      const record = byDate.get(date);
      const raw = record ? accessor(record) : undefined;
      return Number.isFinite(raw) ? raw : undefined;
    });

    const values = points.filter((v) => v !== undefined);
    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    // Kleiner Puffer, damit die Linie bei konstanten Werten nicht am Rand klebt.
    const lo = min === max ? min - 1 : min;
    const hi = min === max ? max + 1 : max;
    const span = hi - lo;

    const xStep = WIDTH / Math.max(dates.length - 1, 1);
    const toY = (value) => HEIGHT - PAD_Y - ((value - lo) / span) * (HEIGHT - PAD_Y * 2);

    const segments = [];
    let current = [];
    points.forEach((value, index) => {
      if (value === undefined) {
        if (current.length > 0) segments.push(current);
        current = [];
        return;
      }
      current.push([index * xStep, toY(value)]);
    });
    if (current.length > 0) segments.push(current);

    return {
      segments,
      avgY: toY(avg),
      stats: { avg, min, max },
      latest: values[values.length - 1],
      lastPoint: segments.length ? segments[segments.length - 1][segments[segments.length - 1].length - 1] : null,
      coverage: values.length,
      totalDays: dates.length,
    };
  }, [records, rangeDays, accessor]);

  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="eyebrow">{label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 5 }} className="num">
            {chart ? format(chart.latest, decimals) : "–"}
            <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: 4, fontWeight: 600 }}>{unit}</span>
          </div>
        </div>
        {chart && (
          <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-faint)" }}>
            {chart.coverage}/{chart.totalDays} Tage
            <br />
            mit Daten
          </div>
        )}
      </div>

      {chart ? (
        <>
          <svg className="chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Durchschnittslinie des sichtbaren Zeitraums */}
            <line
              x1="0"
              x2={WIDTH}
              y1={chart.avgY}
              y2={chart.avgY}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />

            {chart.segments.map((segment, index) => (
              <g key={index}>
                {segment.length > 1 && (
                  <path
                    d={`M ${segment[0][0]},${HEIGHT} ${segment
                      .map(([x, y]) => `L ${x},${y}`)
                      .join(" ")} L ${segment[segment.length - 1][0]},${HEIGHT} Z`}
                    fill={`url(#area-${id})`}
                  />
                )}
                <polyline
                  points={segment.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}

            {chart.lastPoint && (
              <circle cx={chart.lastPoint[0]} cy={chart.lastPoint[1]} r="3" fill={color} vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          <div className="chart-stats">
            <div className="chart-stat">
              <div className="eyebrow">Ø</div>
              <strong>{format(chart.stats.avg, decimals)}</strong>
            </div>
            <div className="chart-stat">
              <div className="eyebrow">Min</div>
              <strong>{format(chart.stats.min, decimals)}</strong>
            </div>
            <div className="chart-stat">
              <div className="eyebrow">Max</div>
              <strong>{format(chart.stats.max, decimals)}</strong>
            </div>
          </div>
        </>
      ) : (
        <p className="empty-state">Keine Daten in diesem Zeitraum</p>
      )}
    </div>
  );
}
