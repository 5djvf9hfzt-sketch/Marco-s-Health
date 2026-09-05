import React, { useMemo } from "react";
import { useAppState } from "../state/store.jsx";
import { BioAgeHero, BioAgeBreakdown } from "../components/BioAgeCard.jsx";
import ScoreRing from "../components/ScoreRing.jsx";
import MetricTile from "../components/MetricTile.jsx";
import SleepStagesBar from "../components/SleepStagesBar.jsx";
import Disclaimer from "../components/Disclaimer.jsx";
import { computeRecoveryScore, computeStrainScore, computeSleepScore, computeSleepDebtMinutes, SLEEP_NEED_MINUTES } from "../models/scores.js";
import { computeDelta, computeWeeklyActiveMinutes, parseLocalClockMinutes, formatClockMinutes } from "../models/baseline.js";

const WHO_WEEKLY_ACTIVE_MINUTES = 150;

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Sammelt die letzten `days` Werte einer Metrik für die Sparklines (Lücken bleiben undefined). */
function historyFor(dayRecords, accessor, days = 14) {
  return dayRecords.slice(-days).map((record) => {
    const value = accessor(record);
    return Number.isFinite(value) ? value : undefined;
  });
}

export default function Home() {
  const { state, actions } = useAppState();
  const { dayRecords } = state;

  const view = useMemo(() => {
    if (dayRecords.length === 0) return null;
    const date = dayRecords[dayRecords.length - 1].date;
    const today = dayRecords[dayRecords.length - 1];

    return {
      date,
      today,
      recovery: computeRecoveryScore(dayRecords, date),
      strain: computeStrainScore(dayRecords, date),
      sleep: computeSleepScore(dayRecords, date),
      sleepDebt: computeSleepDebtMinutes(dayRecords, date, 7),
      weeklyActive: computeWeeklyActiveMinutes(dayRecords, date, 7),
      deltas: {
        hrv: computeDelta(dayRecords, (r) => r.hrv, date),
        restingHeartRate: computeDelta(dayRecords, (r) => r.restingHeartRate, date),
        spo2: computeDelta(dayRecords, (r) => r.spo2, date),
        breathingRate: computeDelta(dayRecords, (r) => r.breathingRate, date),
        cardioFitness: computeDelta(dayRecords, (r) => r.cardioFitness, date),
        steps: computeDelta(dayRecords, (r) => r.steps, date),
      },
    };
  }, [dayRecords]);

  const syncLabel = state.isSyncing
    ? state.syncProgress
      ? `Sync ${state.syncProgress.completed}/${state.syncProgress.total}`
      : "Sync läuft"
    : "Aktualisieren";

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Heute</h1>
          <p className="screen-subtitle">{view ? formatDate(view.date) : "Noch keine Daten"}</p>
        </div>
        <button className="sync-pill" onClick={() => actions.runSync()} disabled={state.isSyncing}>
          {state.isSyncing && <span className="spinner" />}
          {syncLabel}
        </button>
      </div>

      {state.syncErrors.length > 0 && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          Einige Werte konnten nicht geladen werden – die übrigen Daten sind aktuell.
          <br />
          <span style={{ opacity: 0.75, fontSize: 12 }}>{state.syncErrors.join(" · ")}</span>
        </div>
      )}

      <BioAgeHero bioAge={state.bioAge} chronologicalAge={state.profile?.chronologicalAge} />

      <div className="section-label">Tagesscores</div>
      <div className="ring-row">
        <ScoreRing
          id="recovery"
          value={view?.recovery?.score}
          max={100}
          label="Recovery"
          suffix="%"
          colorFrom={
            view?.recovery?.zone === "red" ? "#ff8a5c" : view?.recovery?.zone === "yellow" ? "#ffd76a" : "#0ec2c2"
          }
          colorTo={
            view?.recovery?.zone === "red"
              ? "var(--recovery-low)"
              : view?.recovery?.zone === "yellow"
                ? "var(--recovery-mid)"
                : "var(--recovery)"
          }
          note={view?.recovery && !view.recovery.hasEnoughBaseline ? "Baseline wächst" : undefined}
        />
        <ScoreRing
          id="sleep"
          value={view?.sleep?.score}
          max={100}
          label="Schlaf"
          suffix="%"
          colorFrom="#5b3fd6"
          colorTo="var(--sleep)"
          note={view?.today?.sleepDurationMin ? formatDuration(view.today.sleepDurationMin) : undefined}
        />
        <ScoreRing
          id="strain"
          value={view?.strain?.score}
          max={21}
          label="Strain"
          displayValue={
            view?.strain
              ? view.strain.score.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : undefined
          }
          suffix="von 21"
          colorFrom="#1d6ff2"
          colorTo="var(--strain)"
        />
      </div>

      <div className="section-label">Vitalwerte</div>
      <div className="metric-grid">
        <MetricTile
          label="HRV"
          value={view?.today?.hrv}
          unit="ms"
          decimals={0}
          delta={view?.deltas.hrv}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.hrv)}
          color="var(--recovery)"
        />
        <MetricTile
          label="Ruhepuls"
          value={view?.today?.restingHeartRate}
          unit="bpm"
          decimals={0}
          delta={view?.deltas.restingHeartRate}
          higherIsBetter={false}
          history={historyFor(dayRecords, (r) => r.restingHeartRate)}
          color="var(--recovery-low)"
        />
        <MetricTile
          label="SpO₂"
          value={view?.today?.spo2}
          unit="%"
          decimals={1}
          delta={view?.deltas.spo2}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.spo2)}
          color="var(--strain)"
        />
        <MetricTile
          label="Atemfrequenz"
          value={view?.today?.breathingRate}
          unit="/min"
          decimals={1}
          delta={view?.deltas.breathingRate}
          higherIsBetter={false}
          history={historyFor(dayRecords, (r) => r.breathingRate)}
          color="var(--sleep)"
        />
        <MetricTile
          label="VO₂max"
          value={view?.today?.cardioFitness}
          unit="ml/kg/min"
          decimals={0}
          delta={view?.deltas.cardioFitness}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.cardioFitness)}
          color="var(--recovery)"
        />
        <MetricTile
          label="Schritte"
          value={view?.today?.steps}
          unit=""
          decimals={0}
          delta={view?.deltas.steps}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.steps)}
          color="var(--strain)"
        />
      </div>

      <div className="section-label">Schlaf letzte Nacht</div>
      <div className="card">
        {view?.today?.sleepDurationMin ? (
          <>
            <div className="card-head" style={{ marginBottom: 16 }}>
              <div>
                <div className="eyebrow">Schlafdauer</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }} className="num">
                  {formatDuration(view.today.sleepDurationMin)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="eyebrow">Effizienz</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }} className="num">
                  {view.today.sleepEfficiency ?? "–"}%
                </div>
              </div>
            </div>

            <SleepStagesBar stages={view.today.sleepStages} />

            <div style={{ marginTop: 16 }}>
              <div className="kv-row">
                <span className="muted">Zeit im Bett</span>
                <span className="value">{formatDuration(view.today.timeInBedMin)}</span>
              </div>
              <div className="kv-row">
                <span className="muted">Einschlafzeit</span>
                <span className="value">
                  {formatClockMinutes(parseLocalClockMinutes(view.today.sleepStartTime)) ?? "–"}
                </span>
              </div>
              <div className="kv-row">
                <span className="muted">Schlafdefizit (7 Tage)</span>
                <span className="value">
                  {view.sleepDebt ? formatDuration(view.sleepDebt.debtMinutes) : "–"}
                </span>
              </div>
              <div className="kv-row">
                <span className="muted">Bedarf pro Nacht</span>
                <span className="value">{formatDuration(SLEEP_NEED_MINUTES)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="empty-state">Keine Schlafdaten für die letzte Nacht</p>
        )}
      </div>

      <div className="section-label">Aktivität</div>
      <div className="card">
        <div className="card-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="eyebrow">Aktive Zonenminuten (7 Tage)</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }} className="num">
              {view?.weeklyActive ?? "–"}
              <span style={{ fontSize: 13, color: "var(--text-faint)", fontWeight: 600 }}>
                {" "}
                / {WHO_WEEKLY_ACTIVE_MINUTES} min
              </span>
            </div>
          </div>
        </div>
        <div className="bar-track">
          <div
            className="bar-fill"
            style={{
              width: `${Math.min(100, ((view?.weeklyActive ?? 0) / WHO_WEEKLY_ACTIVE_MINUTES) * 100)}%`,
              background: "linear-gradient(90deg, #1d6ff2, var(--strain))",
            }}
          />
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
          Referenz: 150 Minuten moderate Aktivität pro Woche (WHO-Empfehlung)
        </p>

        <div style={{ marginTop: 14 }}>
          <div className="kv-row">
            <span className="muted">Kalorien heute</span>
            <span className="value">
              {Number.isFinite(view?.today?.calories) ? `${Math.round(view.today.calories).toLocaleString("de-DE")} kcal` : "–"}
            </span>
          </div>
          <div className="kv-row">
            <span className="muted">Intensive Zonenminuten heute</span>
            <span className="value">
              {view?.today?.moderateVigorousZoneMinutes ?? view?.today?.veryActiveMinutes ?? "–"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <BioAgeBreakdown bioAge={state.bioAge} />
      </div>

      <Disclaimer />
    </div>
  );
}
