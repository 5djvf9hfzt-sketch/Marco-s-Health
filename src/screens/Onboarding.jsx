import React, { useState } from "react";
import { useAppState } from "../state/store.jsx";
import { startLogin } from "../auth/fitbitAuth.js";
import Disclaimer from "../components/Disclaimer.jsx";

function StepDots({ current, total = 3 }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }).map((_, index) => (
        <span key={index} className={`step-dot ${index <= current ? "done" : ""}`} />
      ))}
    </div>
  );
}

function ConnectStep({ authErrorMessage }) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <div className="onboarding-shell">
      <StepDots current={0} />

      <div className="brand-mark">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--recovery)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h4l2-6 4 12 2.5-7 1.5 3h6" />
        </svg>
      </div>

      <h1 className="hero-title">VitalSync</h1>
      <p className="hero-text">
        Dein Gesundheits-Dashboard: tägliche Recovery-, Strain- und Sleep-Scores
        plus ein biologisches Alter – berechnet aus deinen Fitbit-Daten.
      </p>

      <div style={{ marginBottom: 26 }}>
        {[
          "Scores relativ zu deiner persönlichen Baseline",
          "Biologisches Alter mit Faktor-Aufschlüsselung",
          "Alle Daten bleiben in deinem Browser",
        ].map((feature) => (
          <div className="feature-row" key={feature}>
            <span className="dot" />
            {feature}
          </div>
        ))}
      </div>

      {authErrorMessage && (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          {authErrorMessage}
        </div>
      )}

      <button
        className="btn-primary"
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
  );
}

function ProfileStep() {
  const { actions } = useAppState();
  const [form, setForm] = useState({ chronologicalAge: "", sex: "female", weightKg: "", heightCm: "" });
  const [submitting, setSubmitting] = useState(false);

  const isValid = Number(form.chronologicalAge) > 0 && Number(form.weightKg) > 0 && Number(form.heightCm) > 0;

  return (
    <div className="onboarding-shell">
      <StepDots current={1} />
      <h1 className="hero-title">Dein Profil</h1>
      <p className="hero-text">
        Diese Angaben bilden die Basis für das biologische Alter. Du kannst sie
        später jederzeit im Tab „Lifestyle" ändern.
      </p>

      <div className="field">
        <label className="field-label">Chronologisches Alter (Jahre)</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="z.B. 38"
          value={form.chronologicalAge}
          onChange={(e) => setForm({ ...form, chronologicalAge: e.target.value })}
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
            <button key={value} className={form.sex === value ? "selected" : ""} onClick={() => setForm({ ...form, sex: value })}>
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
            placeholder="72"
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label">Größe (cm)</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="178"
            value={form.heightCm}
            onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
          />
        </div>
      </div>

      <button
        className="btn-primary"
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
  );
}

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
    <div className="onboarding-shell">
      <StepDots current={2} />
      <h1 className="hero-title">Lifestyle</h1>
      <p className="hero-text">
        Vier kurze Fragen – sie haben den größten Einfluss auf die Schätzung und
        sind jederzeit editierbar.
      </p>

      <div className="field">
        <label className="field-label">Raucherstatus</label>
        <div className="choice-group">
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
        <div className="field">
          <label className="field-label">Zigaretten pro Tag</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="z.B. 10"
            value={form.cigarettesPerDay}
            onChange={(e) => setForm({ ...form, cigarettesPerDay: e.target.value })}
          />
        </div>
      )}

      <div className="field">
        <label className="field-label">Alkohol (Einheiten pro Woche)</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={form.alcoholUnitsPerWeek}
          onChange={(e) => setForm({ ...form, alcoholUnitsPerWeek: e.target.value })}
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

      <button
        className="btn-primary"
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
        Dashboard öffnen
      </button>

      {state.isSyncing && (
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 14, textAlign: "center" }}>
          Fitbit-Historie wird im Hintergrund geladen
          {state.syncProgress ? ` · ${state.syncProgress.completed}/${state.syncProgress.total}` : " …"}
        </p>
      )}
    </div>
  );
}

export default function Onboarding({ authErrorMessage }) {
  const { state } = useAppState();

  if (!state.connected) return <ConnectStep authErrorMessage={authErrorMessage} />;
  if (!state.profile) return <ProfileStep />;
  return <LifestyleStep />;
}
