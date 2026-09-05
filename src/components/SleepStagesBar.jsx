import React from "react";

const STAGES = [
  { key: "deep", label: "Tief", color: "#5b3fd6" },
  { key: "rem", label: "REM", color: "#8b6dff" },
  { key: "light", label: "Leicht", color: "#b3a2ff" },
  { key: "wake", label: "Wach", color: "rgba(255,255,255,0.22)" },
];

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Gestapelter Balken der Schlafphasen einer Nacht plus Legende mit Minuten. */
export default function SleepStagesBar({ stages }) {
  const total = STAGES.reduce((sum, stage) => sum + (stages?.[stage.key] ?? 0), 0);
  if (!stages || total === 0) {
    return <p className="empty-state">Keine Schlafphasen-Daten für diese Nacht</p>;
  }

  return (
    <>
      <div className="stage-bar">
        {STAGES.map((stage) => {
          const minutes = stages[stage.key] ?? 0;
          if (minutes <= 0) return null;
          return (
            <span
              key={stage.key}
              style={{ width: `${(minutes / total) * 100}%`, background: stage.color }}
              title={`${stage.label}: ${formatMinutes(minutes)}`}
            />
          );
        })}
      </div>
      <div className="stage-legend">
        {STAGES.map((stage) => (
          <div key={stage.key} className="stage-legend-item">
            <span className="dot" style={{ background: stage.color }} />
            {stage.label}
            <strong>{formatMinutes(stages[stage.key])}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
