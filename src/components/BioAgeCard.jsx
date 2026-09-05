import React, { useState } from "react";
import ConfidenceBadge from "./ConfidenceBadge.jsx";
import { summarizeByCategory } from "../models/biologicalAge.js";

function formatYears(years) {
  const rounded = Math.round(years * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${Math.abs(rounded).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Zweiseitiger Balken: Mitte = neutral, nach links = jünger, nach rechts = älter. */
function FactorBar({ years, scale }) {
  if (years == null) return <div className="factor-bar" />;
  const width = Math.min(50, (Math.abs(years) / scale) * 50);
  const isPositive = years > 0;
  return (
    <div className="factor-bar">
      <span
        style={{
          width: `${width}%`,
          left: isPositive ? "50%" : `${50 - width}%`,
          background: isPositive ? "var(--recovery-low)" : "var(--recovery)",
        }}
      />
    </div>
  );
}

function yearsClass(years) {
  if (years == null) return "none";
  return years > 0.05 ? "positive" : years < -0.05 ? "negative" : "";
}

export function BioAgeHero({ bioAge, chronologicalAge }) {
  if (!bioAge) {
    return (
      <div className="card bio-hero">
        <div className="eyebrow">Biologisches Alter</div>
        <p className="empty-state">
          Wird berechnet, sobald Profil und erste Fitbit-Daten vorliegen.
        </p>
      </div>
    );
  }

  const delta = bioAge.deltaYears;
  const deltaClass = delta < -0.1 ? "better" : delta > 0.1 ? "worse" : "";

  return (
    <div className="card bio-hero">
      <div className="eyebrow">Biologisches Alter</div>
      <div className="bio-value">
        {bioAge.biologicalAge.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </div>
      <div className="bio-unit">Jahre · chronologisch {chronologicalAge}</div>
      <div className={`bio-delta ${deltaClass}`}>
        {formatYears(delta)} Jahre {delta < 0 ? "jünger" : delta > 0 ? "älter" : "gleichauf"}
      </div>
      <div style={{ marginTop: 14 }}>
        <ConfidenceBadge confidence={bioAge.confidence} />
      </div>
    </div>
  );
}

const SMOKING_LABELS = { never: "Nie geraucht", former: "Früher geraucht", current: "Aktuell Raucher" };

/** Rohwert eines Faktors leserlich darstellen (Zahl + Einheit bzw. übersetzter Status). */
function formatInput(item) {
  if (item.inputValue == null) return null;
  if (typeof item.inputValue === "string") return SMOKING_LABELS[item.inputValue] ?? item.inputValue;
  const number = item.inputValue.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return item.unit ? `${number} ${item.unit}` : number;
}

export function BioAgeBreakdown({ bioAge }) {
  const [expanded, setExpanded] = useState(false);
  if (!bioAge) return null;

  const categories = summarizeByCategory(bioAge.breakdown);
  const items = expanded ? bioAge.breakdown : categories;

  // Skala so wählen, dass der größte Beitrag den Balken füllt – mindestens
  // 2 Jahre, damit kleine Abweichungen nicht dramatisch aussehen.
  const scale = Math.max(2, ...items.map((item) => Math.abs(item.years ?? 0)));

  return (
    <div className="card">
      <div className="card-head">
        <div className="eyebrow">Bio-Age Faktoren</div>
        <button className="toggle-link" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Kategorien" : "Alle Details"}
        </button>
      </div>

      {items.map((item) => (
        <div className="factor-row" key={item.factorKey ?? item.categoryKey}>
          <div className="factor-name">
            {item.label ?? item.categoryLabel}
            {expanded && formatInput(item) && <span className="factor-input">{formatInput(item)}</span>}
          </div>
          <FactorBar years={item.years} scale={scale} />
          <div className={`factor-years ${yearsClass(item.years)}`}>
            {item.years == null ? "n/a" : `${formatYears(item.years)} J`}
          </div>
        </div>
      ))}

      <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 12, lineHeight: 1.5 }}>
        Positive Werte lassen dich rechnerisch älter wirken, negative jünger. Faktoren
        ohne Daten ("n/a") fließen nicht in die Summe ein.
      </p>
    </div>
  );
}
