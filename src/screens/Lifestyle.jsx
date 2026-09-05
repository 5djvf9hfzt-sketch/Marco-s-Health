import React, { useState, useEffect } from "react";
import { useAppState } from "../state/store.jsx";
import { logout } from "../auth/fitbitAuth.js";

const DIET_LABELS = {
  1: "Viel Verarbeitetes, viel Zucker",
  2: "Überwiegend unausgewogen",
  3: "Gemischt",
  4: "Überwiegend ausgewogen",
  5: "Durchgehend vollwertig",
};

const STRESS_LABELS = {
  1: "Sehr entspannt",
  2: "Entspannt",
  3: "Mittel",
  4: "Angespannt",
  5: "Dauerhaft hoch",
};

const SMOKING_LABELS = { never: "Nie", former: "Früher", current: "Aktuell" };

function SavedButton({ onSave, children }) {
  const [state, setState] = useState("idle");
  return (
    <button
      className="btn-primary"
      disabled={state === "saving"}
      onClick={async () => {
        setState("saving");
        await onSave();
        setState("saved");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "saved" ? "Gespeichert ✓" : state === "saving" ? "Speichern …" : children}
    </button>
  );
}

export default function Lifestyle() {
  const { state, actions } = useAppState();

  const [profileForm, setProfileForm] = useState({ chronologicalAge: "", sex: "female", weightKg: "", heightCm: "" });
  const [form, setForm] = useState({
    smokingStatus: "never",
    cigarettesPerDay: 0,
    alcoholUnitsPerWeek: 0,
    dietScore: 3,
    stressLevel: 3,
  });

  useEffect(() => {
    if (state.profile) {
      setProfileForm({
        chronologicalAge: String(state.profile.chronologicalAge ?? ""),
        sex: state.profile.sex ?? "female",
        weightKg: String(state.profile.weightKg ?? ""),
        heightCm: String(state.profile.heightCm ?? ""),
      });
    }
  }, [state.profile]);

  useEffect(() => {
    if (state.lifestyle) {
      setForm({
        smokingStatus: state.lifestyle.smokingStatus ?? "never",
        cigarettesPerDay: state.lifestyle.cigarettesPerDay ?? 0,
        alcoholUnitsPerWeek: state.lifestyle.alcoholUnitsPerWeek ?? 0,
        dietScore: state.lifestyle.dietScore ?? 3,
        stressLevel: state.lifestyle.stressLevel ?? 3,
      });
    }
  }, [state.lifestyle]);

  const heightM = Number(profileForm.heightCm) / 100;
  const bmi = heightM > 0 && Number(profileForm.weightKg) > 0 ? Number(profileForm.weightKg) / (heightM * heightM) : null;

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Lifestyle</h1>
          <p className="screen-subtitle">Fließt direkt in dein biologisches Alter ein</p>
        </div>
      </div>

      <div className="section-label">Profil</div>
      <div className="card">
        <div className="field">
          <label className="field-label">Chronologisches Alter</label>
          <input
            type="number"
            inputMode="numeric"
            value={profileForm.chronologicalAge}
            onChange={(e) => setProfileForm({ ...profileForm, chronologicalAge: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field-label">Geschlecht</label>
          <div className="choice-group">
            {[
              ["female", "Weiblich"],
              ["male", "Männlich"],
              ["other", "Divers"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={profileForm.sex === value ? "selected" : ""}
                onClick={() => setProfileForm({ ...profileForm, sex: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="field-label">Gewicht (kg)</label>
            <input
              type="number"
              inputMode="decimal"
              value={profileForm.weightKg}
              onChange={(e) => setProfileForm({ ...profileForm, weightKg: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label">Größe (cm)</label>
            <input
              type="number"
              inputMode="numeric"
              value={profileForm.heightCm}
              onChange={(e) => setProfileForm({ ...profileForm, heightCm: e.target.value })}
            />
          </div>
        </div>

        {bmi && (
          <div className="kv-row" style={{ marginBottom: 14 }}>
            <span className="muted">Daraus berechneter BMI</span>
            <span className="value">{bmi.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg/m²</span>
          </div>
        )}

        <SavedButton
          onSave={async () => {
            await actions.saveProfile({
              chronologicalAge: Number(profileForm.chronologicalAge) || 0,
              sex: profileForm.sex,
              weightKg: Number(profileForm.weightKg) || 0,
              heightCm: Number(profileForm.heightCm) || 0,
            });
            await actions.recomputeBioAge({ force: true });
          }}
        >
          Profil speichern
        </SavedButton>
      </div>

      <div className="section-label">Fragebogen</div>
      <div className="card">
        <div className="field">
          <label className="field-label">Raucherstatus</label>
          <div className="choice-group">
            {Object.entries(SMOKING_LABELS).map(([value, label]) => (
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
          <div className="field">
            <label className="field-label">Zigaretten pro Tag</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.cigarettesPerDay}
              onChange={(e) => setForm({ ...form, cigarettesPerDay: Number(e.target.value) || 0 })}
            />
          </div>
        )}

        <div className="field">
          <label className="field-label">Alkohol (Einheiten pro Woche)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.alcoholUnitsPerWeek}
            onChange={(e) => setForm({ ...form, alcoholUnitsPerWeek: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="field">
          <label className="field-label">Ernährungsqualität · {DIET_LABELS[form.dietScore]}</label>
          <input
            type="range"
            min="1"
            max="5"
            value={form.dietScore}
            onChange={(e) => setForm({ ...form, dietScore: Number(e.target.value) })}
          />
          <div className="scale-hint">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Stresslevel · {STRESS_LABELS[form.stressLevel]}</label>
          <input
            type="range"
            min="1"
            max="5"
            value={form.stressLevel}
            onChange={(e) => setForm({ ...form, stressLevel: Number(e.target.value) })}
          />
          <div className="scale-hint">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        <SavedButton
          onSave={async () => {
            await actions.saveLifestyle(form);
            await actions.recomputeBioAge({ force: true });
          }}
        >
          Fragebogen speichern
        </SavedButton>
      </div>

      <div className="section-label">Änderungsverlauf</div>
      <div className="card">
        {state.lifestyleHistory.length === 0 ? (
          <p className="empty-state">Noch keine Änderungen erfasst</p>
        ) : (
          [...state.lifestyleHistory]
            .reverse()
            .slice(0, 20)
            .map((entry, index) => (
              <div key={index} className="kv-row" style={{ alignItems: "flex-start" }}>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {new Date(entry.updatedAt).toLocaleString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span style={{ fontSize: 12.5, textAlign: "right", color: "var(--text-dim)" }}>
                  {SMOKING_LABELS[entry.smokingStatus]} · {entry.alcoholUnitsPerWeek} E/Wo · Ernährung {entry.dietScore}/5 ·
                  Stress {entry.stressLevel}/5
                </span>
              </div>
            ))
        )}
      </div>

      <div className="section-label">Verbindung</div>
      <div className="card">
        <div className="kv-row">
          <span className="muted">Fitbit</span>
          <span className="value" style={{ color: "var(--recovery)" }}>Verbunden</span>
        </div>
        <div className="kv-row">
          <span className="muted">Letzter Sync</span>
          <span className="value">{state.syncState.lastSyncedDate ?? "–"}</span>
        </div>
        <div className="kv-row">
          <span className="muted">Erfasste Tage</span>
          <span className="value">{state.dayRecords.length}</span>
        </div>
        <button
          className="btn-ghost"
          style={{ marginTop: 14 }}
          onClick={() => {
            const confirmed = window.confirm(
              "Fitbit-Verbindung trennen? Deine bereits geladenen Daten bleiben auf diesem Gerät erhalten."
            );
            if (confirmed) {
              logout();
              window.location.reload();
            }
          }}
        >
          Fitbit-Verbindung trennen
        </button>
      </div>
    </div>
  );
}
