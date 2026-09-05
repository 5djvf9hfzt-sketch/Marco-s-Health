import React, { useState } from "react";
import { useAppState } from "../state/store.jsx";
import { startLogin } from "../auth/fitbitAuth.js";
import Disclaimer from "../components/Disclaimer.jsx";

function ConnectStep({ authErrorMessage }) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  return (
    <div className="centered-screen" style={{ flexDirection: "column" }}>
      <div className="card" style={{ maxWidth: 420 }}>
        <h1 className="screen-title">Willkommen bei VitalSync</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
          VitalSync berechnet aus deinen Fitbit-Daten ein biologisches Alter sowie
          tägliche Recovery-, Strain- und Sleep-Scores – alles läuft nur in
          deinem Browser, es gibt kein Backend und keine externe Speicherung
          deiner Gesundheitsdaten.
        </p>
        {authErrorMessage && <p className="error-text">{authErrorMessage}</p>}
        <button
          className="primary-button"
          disabled={isRedirecting}
          onClick={() => {
            setIsRedirecting(true);
            startLogin();
          }}
        >
          {isRedirecting ? "Weiterleitung zu Fitbit …" : "Mit Fitbit verbinden"}
        </button>
        <Disclaimer />
      </div>
    </div>
  );
}

function ProfileStep() {
  const { actions } = useAppState();
  const [form, setForm] = useState({ chronologicalAge: "", sex: "female", weightKg: "", heightCm: "" });
  const [submitting, setSubmitting] = useState(false);

  const isValid = Number(form.chronologicalAge) > 0 && Number(form.weightKg) > 0 && Number(form.heightCm) > 0;

  return (
    <div className="centered-screen" style={{ flexDirection: "column" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 className="screen-title">Dein Profil</h1>

        <div className="form-field">
          <label>Chronologisches Alter (Jahre)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.chronologicalAge}
            onChange={(e) => setForm({ ...form, chronologicalAge: e.target.value })}
          />
        </div>

        <div className="form-field">
          <label>Geschlecht</label>
          <div className="radio-group">
            {[
              ["female", "Weiblich"],
              ["male", "Männlich"],
              ["other", "Divers"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={form.sex === value ? "selected" : ""}
                onClick={() => setForm({ ...form, sex: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label>Gewicht (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
          />
        </div>

        <div className="form-field">
          <label>Größe (cm)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.heightCm}
            onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
          />
        </div>

        <button
          className="primary-button"
          disabled={!isValid || submitting}
          onClick={async () => {
            setSubmitting(true);
            await actions.saveProfile({
              chronologicalAge: Number(form.chronologicalAge),
              sex: form.sex,
              weightKg: Number(form.weightKg),
              heightCm: Number(form.heightCm),
            });
          }}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

const DIET_LABELS = {
  1: "Viel verarbeitet, viel Zucker, wenig Gemüse/Obst",
  2: "Überwiegend unausgewogen",
  3: "Gemischt",
  4: "Überwiegend ausgewogen, viel Gemüse/Obst",
  5: "Durchgehend vollwertig, wenig Zucker/verarbeitet",
};

function LifestyleStep() {
  const { actions, state } = useAppState();
  const [form, setForm] = useState({
    smokingStatus: "never",
    cigarettesPerDay: "",
    alcoholUnitsPerWeek: "",
    dietScore: 3,
    stressLevel: 3,
  });
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="centered-screen" style={{ flexDirection: "column" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <h1 className="screen-title">Lifestyle-Fragebogen</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Diese Angaben kannst du jederzeit im Tab "Lifestyle" bearbeiten.
        </p>

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
              onChange={(e) => setForm({ ...form, cigarettesPerDay: e.target.value })}
            />
          </div>
        )}

        <div className="form-field">
          <label>Alkohol (Einheiten pro Woche)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.alcoholUnitsPerWeek}
            onChange={(e) => setForm({ ...form, alcoholUnitsPerWeek: e.target.value })}
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
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            await actions.saveLifestyle({
              smokingStatus: form.smokingStatus,
              cigarettesPerDay: form.smokingStatus === "current" ? Number(form.cigarettesPerDay) || 0 : 0,
              alcoholUnitsPerWeek: Number(form.alcoholUnitsPerWeek) || 0,
              dietScore: form.dietScore,
              stressLevel: form.stressLevel,
            });
          }}
        >
          Fertigstellen
        </button>

        {state.isSyncing && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            Fitbit-Historie wird im Hintergrund geladen
            {state.syncProgress ? ` (${state.syncProgress.completed}/${state.syncProgress.total})` : "…"}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Onboarding({ authErrorMessage }) {
  const { state } = useAppState();

  if (!state.connected) return <ConnectStep authErrorMessage={authErrorMessage} />;
  if (!state.profile) return <ProfileStep />;
  return <LifestyleStep />;
}
