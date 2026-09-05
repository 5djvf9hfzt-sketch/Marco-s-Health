import React, { useState, useEffect } from "react";
import { useAppState } from "../state/store.jsx";

const DIET_LABELS = {
  1: "Viel verarbeitet, viel Zucker, wenig Gemüse/Obst",
  2: "Überwiegend unausgewogen",
  3: "Gemischt",
  4: "Überwiegend ausgewogen, viel Gemüse/Obst",
  5: "Durchgehend vollwertig, wenig Zucker/verarbeitet",
};

export default function Lifestyle() {
  const { state, actions } = useAppState();
  const [form, setForm] = useState({
    smokingStatus: "never",
    cigarettesPerDay: 0,
    alcoholUnitsPerWeek: 0,
    dietScore: 3,
    stressLevel: 3,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.lifestyle) {
      setForm({
        smokingStatus: state.lifestyle.smokingStatus,
        cigarettesPerDay: state.lifestyle.cigarettesPerDay ?? 0,
        alcoholUnitsPerWeek: state.lifestyle.alcoholUnitsPerWeek ?? 0,
        dietScore: state.lifestyle.dietScore ?? 3,
        stressLevel: state.lifestyle.stressLevel ?? 3,
      });
    }
  }, [state.lifestyle]);

  return (
    <div>
      <h1 className="screen-title">Lifestyle</h1>

      <div className="card">
        <div className="form-field">
          <label>Raucherstatus</label>
          <div className="radio-group">
            {[
              ["never", "Nie"],
              ["former", "Früher"],
              ["current", "Aktuell"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={form.smokingStatus === value ? "selected" : ""}
                onClick={() => setForm({ ...form, smokingStatus: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {form.smokingStatus === "current" && (
          <div className="form-field">
            <label>Zigaretten pro Tag</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.cigarettesPerDay}
              onChange={(e) => setForm({ ...form, cigarettesPerDay: Number(e.target.value) || 0 })}
            />
          </div>
        )}

        <div className="form-field">
          <label>Alkohol (Einheiten pro Woche)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.alcoholUnitsPerWeek}
            onChange={(e) => setForm({ ...form, alcoholUnitsPerWeek: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="form-field">
          <label>Ernährungsqualität: {DIET_LABELS[form.dietScore]}</label>
          <input
            type="range"
            min="1"
            max="5"
            value={form.dietScore}
            onChange={(e) => setForm({ ...form, dietScore: Number(e.target.value) })}
          />
        </div>

        <div className="form-field">
          <label>Subjektives Stresslevel: {form.stressLevel} / 5</label>
          <input
            type="range"
            min="1"
            max="5"
            value={form.stressLevel}
            onChange={(e) => setForm({ ...form, stressLevel: Number(e.target.value) })}
          />
        </div>

        <button
          className="primary-button"
          onClick={async () => {
            await actions.saveLifestyle(form);
            await actions.recomputeBioAge({ force: true });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          {saved ? "Gespeichert ✓" : "Speichern"}
        </button>
      </div>

      <div className="card">
        <p className="card-label">Änderungsverlauf</p>
        <div className="history-list">
          {state.lifestyleHistory.length === 0 && <p>Noch keine Änderungen</p>}
          {[...state.lifestyleHistory].reverse().map((entry, idx) => (
            <div key={idx} className="history-entry">
              {new Date(entry.updatedAt).toLocaleString("de-DE")} – Rauchen: {entry.smokingStatus}, Alkohol:{" "}
              {entry.alcoholUnitsPerWeek} E/Woche, Ernährung: {entry.dietScore}/5, Stress: {entry.stressLevel}/5
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
