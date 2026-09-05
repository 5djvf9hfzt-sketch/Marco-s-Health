import React from "react";
import ConfidenceBadge from "./ConfidenceBadge.jsx";
import { summarizeByCategory } from "../models/biologicalAge.js";

export default function BioAgeCard({ bioAge, chronologicalAge }) {
  if (!bioAge) {
    return (
      <div className="card bio-age-card">
        <p className="card-label">Biologisches Alter</p>
        <p>Wird berechnet, sobald genug Fitbit-Daten vorliegen …</p>
      </div>
    );
  }

  const delta = bioAge.deltaYears;
  const deltaClass = delta < -0.1 ? "better" : delta > 0.1 ? "worse" : "";
  const sign = delta > 0 ? "+" : "";
  const categories = summarizeByCategory(bioAge.breakdown);

  return (
    <div className="card bio-age-card">
      <p className="card-label">Biologisches Alter</p>
      <div className="bio-age-value">{bioAge.biologicalAge}</div>
      <div className={`bio-age-delta ${deltaClass}`}>
        {sign}
        {delta} Jahre gegenüber chronologischem Alter ({chronologicalAge})
      </div>
      <ConfidenceBadge confidence={bioAge.confidence} />

      <div style={{ marginTop: 20, textAlign: "left" }}>
        {categories.map((cat) => (
          <div key={cat.categoryKey} className="factor-breakdown-item">
            <span>{cat.categoryLabel}</span>
            <span className={`factor-years ${cat.years > 0 ? "positive" : cat.years < 0 ? "negative" : ""}`}>
              {cat.years > 0 ? "+" : ""}
              {cat.years} J.
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
