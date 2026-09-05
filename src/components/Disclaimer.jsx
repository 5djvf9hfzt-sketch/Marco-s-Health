import React from "react";

export default function Disclaimer() {
  return (
    <p className="disclaimer">
      <strong style={{ color: "var(--text-dim)" }}>Hinweis:</strong> VitalSync liefert
      Schätzwerte zur Selbstreflexion auf Basis vereinfachter, nicht klinisch
      validierter Berechnungen – keine Diagnose und keine medizinische Beratung.
      Bei gesundheitlichen Fragen wende dich an medizinisches Fachpersonal.
    </p>
  );
}
