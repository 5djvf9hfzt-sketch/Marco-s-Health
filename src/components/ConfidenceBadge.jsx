import React from "react";

const LABELS = { low: "Niedrige Konfidenz", medium: "Mittlere Konfidenz", high: "Hohe Konfidenz" };

export default function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  return <span className={`confidence-badge confidence-${confidence}`}>{LABELS[confidence]}</span>;
}
