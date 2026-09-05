import React from "react";

export default function StrainGauge({ strain }) {
  if (!strain) {
    return (
      <div className="card ring-card">
        <p className="card-label">Strain</p>
        <p>Keine Daten für heute</p>
      </div>
    );
  }

  const pct = Math.round((strain.score / 21) * 100);

  return (
    <div className="card ring-card">
      <p className="card-label">Strain</p>
      <div className="ring-value">{strain.score.toFixed(1)}</div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Skala 0–21</p>
    </div>
  );
}
