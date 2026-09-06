import React from "react";
import Sparkline from "./Sparkline.jsx";

function formatNumber(value, decimals) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Kachel für einen einzelnen Messwert: aktueller Wert, Abweichung zur
 * persönlichen 30-Tage-Baseline und ein Mini-Verlauf der letzten Tage.
 *
 * @param {object} props
 * @param {number|null|undefined} props.value Aktueller Messwert (null/undefined => "keine Daten")
 * @param {object|null} props.delta Ergebnis von computeDelta() aus baseline.js
 * @param {boolean} props.higherIsBetter Steuert nur die Einfärbung der Abweichung.
 */
export default function MetricTile({
  label,
  value,
  unit,
  decimals = 0,
  delta,
  higherIsBetter = true,
  history = [],
  color = "var(--text-dim)",
  asOf,
}) {
  const hasValue = Number.isFinite(value);

  let deltaClass = "neutral";
  let deltaText = "keine Baseline";
  if (delta && Number.isFinite(delta.absolute)) {
    const isImprovement = higherIsBetter ? delta.absolute > 0 : delta.absolute < 0;
    // Sehr kleine Abweichungen nicht einfärben – das wäre Scheingenauigkeit.
    const isRelevant = delta.percent != null && Math.abs(delta.percent) >= 2;
    deltaClass = isRelevant ? (isImprovement ? "good" : "bad") : "neutral";
    const arrow = delta.absolute > 0 ? "▲" : "▼";
    deltaText = `${arrow} ${formatNumber(Math.abs(delta.absolute), decimals)} vs. Ø`;
  }

  return (
    <div className="metric-tile">
      <div className="metric-tile-label">
        {label}
        {/* Stammt der Wert nicht von heute, wird das offen ausgewiesen, statt
            einen älteren Messwert als aktuell auszugeben. */}
        {hasValue && asOf && <span style={{ color: "var(--text-faint)", marginLeft: 5 }}>· {asOf}</span>}
      </div>
      <div className="metric-tile-value">
        {hasValue ? (
          <>
            {formatNumber(value, decimals)}
            <span className="unit">{unit}</span>
          </>
        ) : (
          <span style={{ color: "var(--text-faint)", fontSize: 20 }}>–</span>
        )}
      </div>
      <div className="metric-tile-foot">
        <span className={`delta ${hasValue ? deltaClass : "neutral"}`}>{hasValue ? deltaText : "keine Daten"}</span>
        <Sparkline values={history} color={color} />
      </div>
    </div>
  );
}
