import React from "react";

const CIRCUMFERENCE = 2 * Math.PI * 40;

export default function RecoveryRing({ recovery }) {
  if (!recovery) {
    return (
      <div className="card ring-card">
        <p className="card-label">Recovery</p>
        <p>Keine Daten für heute</p>
      </div>
    );
  }

  const offset = CIRCUMFERENCE * (1 - recovery.score / 100);
  const colorVar =
    recovery.zone === "green" ? "var(--green)" : recovery.zone === "yellow" ? "var(--yellow)" : "var(--red)";

  return (
    <div className="card ring-card">
      <p className="card-label">Recovery</p>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ margin: "0 auto", display: "block" }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={colorVar}
          strokeWidth="8"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="56" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text)">
          {recovery.score}
        </text>
      </svg>
      {!recovery.hasEnoughBaseline && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Baseline wird noch aufgebaut</p>}
    </div>
  );
}
