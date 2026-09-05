import React from "react";

const LABELS = {
  low: "Konfidenz niedrig",
  medium: "Konfidenz mittel",
  high: "Konfidenz hoch",
};

export default function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  return (
    <span className={`confidence-badge confidence-${confidence}`}>
      <span className="confidence-dot" />
      {LABELS[confidence]}
    </span>
  );
}
