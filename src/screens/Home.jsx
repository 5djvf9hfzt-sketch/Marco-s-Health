import React, { useMemo } from "react";
import { useAppState } from "../state/store.jsx";
import { BioAgeHero, BioAgeBreakdown } from "../components/BioAgeCard.jsx";
import ScoreRing from "../components/ScoreRing.jsx";
import MetricTile from "../components/MetricTile.jsx";
import SleepStagesBar from "../components/SleepStagesBar.jsx";
import Disclaimer from "../components/Disclaimer.jsx";
import { computeRecoveryScore, computeStrainScore, computeSleepScore, computeSleepDebtMinutes, SLEEP_NEED_MINUTES } from "../models/scores.js";
import { computeDelta, computeWeeklyActiveMinutes, parseLocalClockMinutes, formatClockMinutes } from "../models/baseline.js";
import { needsReconnect, startLogin } from "../auth/googleAuth.js";

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

const MS_PER_DAY = 86_400_000;

function ageInDays(dateIso) {
  return Math.round((Date.now() - new Date(dateIso + "T12:00:00").getTime()) / MS_PER_DAY);
}

/** "gestern" / "vor 5 Tagen" – oder null, wenn der Wert von heute stammt. */
function describeAge(dateIso) {
  const days = ageInDays(dateIso);
  if (days <= 0) return null;
  return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

/** Kurzform für die engen Kachel-Beschriftungen. */
function describeAgeShort(dateIso) {
  const days = ageInDays(dateIso);
  if (days <= 0) return null;
  return days === 1 ? "gestern" : `vor ${days} T`;
}

/**
 * Sucht den jüngsten Tag, für den diese Metrik überhaupt einen Wert hat.
 *
 * Hintergrund: Wer die Uhr nicht jeden Tag trägt (oder sie hat heute noch
 * nicht synchronisiert), hätte sonst ein komplett leeres Dashboard, obwohl
 * Daten vorliegen. Statt "keine Daten" zeigen wir den letzten bekannten Wert
 * und schreiben offen dazu, von wann er stammt.
 */
function latestValue(dayRecords, accessor) {
  for (let i = dayRecords.length - 1; i >= 0; i -= 1) {
    const value = accessor(dayRecords[i]);
    if (Number.isFinite(value)) {
      return {
        value,
        date: dayRecords[i].date,
        asOf: describeAge(dayRecords[i].date),
        asOfShort: describeAgeShort(dayRecords[i].date),
      };
    }
  }
  return { value: undefined, date: null, asOf: null, asOfShort: null };
}

/** Wie latestValue, aber für die berechneten Tagesscores. */
function latestScore(dayRecords, compute) {
  for (let i = dayRecords.length - 1; i >= 0; i -= 1) {
    const result = compute(dayRecords, dayRecords[i].date);
    if (result && Number.isFinite(result.score)) {
      return { ...result, date: dayRecords[i].date, asOf: describeAge(dayRecords[i].date) };
    }
  }
  return null;
}

export default function Home() {
  const { state, actions } = useAppState();
  const { dayRecords } = state;

  const view = useMemo(() => {
    if (dayRecords.length === 0) return null;
    const date = dayRecords[dayRecords.length - 1].date;

    // Pro Metrik der jeweils jüngste vorhandene Wert – nicht zwingend von
    // heute, dafür aber überhaupt vorhanden (siehe latestValue).
    const vitals = {
      hrv: latestValue(dayRecords, (r) => r.hrv),
      restingHeartRate: latestValue(dayRecords, (r) => r.restingHeartRate),
      spo2: latestValue(dayRecords, (r) => r.spo2),
      breathingRate: latestValue(dayRecords, (r) => r.breathingRate),
      cardioFitness: latestValue(dayRecords, (r) => r.cardioFitness),
      steps: latestValue(dayRecords, (r) => r.steps),
      calories: latestValue(dayRecords, (r) => r.calories),
      zoneMinutes: latestValue(dayRecords, (r) => r.moderateVigorousZoneMinutes ?? r.veryActiveMinutes),
    };

    // Die letzte Nacht mit Schlafdaten (nicht unbedingt die vergangene).
    const lastSleepDate = latestValue(dayRecords, (r) => r.sleepDurationMin).date;
    const lastSleepRecord = lastSleepDate ? dayRecords.find((r) => r.date === lastSleepDate) : null;

    return {
      date,
      vitals,
      lastSleepRecord,
      lastSleepAsOf: lastSleepDate ? describeAge(lastSleepDate) : null,
      recovery: latestScore(dayRecords, computeRecoveryScore),
      strain: latestScore(dayRecords, computeStrainScore),
      sleep: latestScore(dayRecords, computeSleepScore),
      sleepDebt: computeSleepDebtMinutes(dayRecords, date, 7),
      weeklyActive: computeWeeklyActiveMinutes(dayRecords, date, 7),
      // Die Abweichung bezieht sich jeweils auf den Tag, aus dem der
      // angezeigte Wert stammt – sonst würde man Äpfel mit Birnen vergleichen.
      deltas: {
        hrv: vitals.hrv.date ? computeDelta(dayRecords, (r) => r.hrv, vitals.hrv.date) : null,
        restingHeartRate: vitals.restingHeartRate.date
          ? computeDelta(dayRecords, (r) => r.restingHeartRate, vitals.restingHeartRate.date)
          : null,
        spo2: vitals.spo2.date ? computeDelta(dayRecords, (r) => r.spo2, vitals.spo2.date) : null,
        breathingRate: vitals.breathingRate.date
          ? computeDelta(dayRecords, (r) => r.breathingRate, vitals.breathingRate.date)
          : null,
        cardioFitness: vitals.cardioFitness.date
          ? computeDelta(dayRecords, (r) => r.cardioFitness, vitals.cardioFitness.date)
          : null,
        steps: vitals.steps.date ? computeDelta(dayRecords, (r) => r.steps, vitals.steps.date) : null,
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
          <p className="screen-subtitle">{formatDate(new Date().toISOString().slice(0, 10))}</p>
        </div>
        <button className="sync-pill" onClick={() => actions.runSync()} disabled={state.isSyncing}>
          {state.isSyncing && <span className="spinner" />}
          {syncLabel}
        </button>
      </div>

      {needsReconnect() && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          Die Google-Sitzung ist abgelaufen. Deine gespeicherten Daten bleiben erhalten – für neue
          Werte einmal neu verbinden.
          <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => startLogin()}>
            Neu verbinden
          </button>
        </div>
      )}

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
          asOf={view?.recovery?.asOf}
        />
        <ScoreRing
          id="sleep"
          value={view?.sleep?.score}
          max={100}
          label="Schlaf"
          suffix="%"
          colorFrom="#5b3fd6"
          colorTo="var(--sleep)"
          note={view?.lastSleepRecord?.sleepDurationMin ? formatDuration(view.lastSleepRecord.sleepDurationMin) : undefined}
          asOf={view?.sleep?.asOf}
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
          asOf={view?.strain?.asOf}
        />
      </div>

      <div className="section-label">Vitalwerte</div>
      <div className="metric-grid">
        <MetricTile
          label="HRV"
          value={view?.vitals.hrv.value}
          unit="ms"
          decimals={0}
          delta={view?.deltas.hrv}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.hrv)}
          asOf={view?.vitals.hrv.asOfShort}
          color="var(--recovery)"
        />
        <MetricTile
          label="Ruhepuls"
          value={view?.vitals.restingHeartRate.value}
          unit="bpm"
          decimals={0}
          delta={view?.deltas.restingHeartRate}
          higherIsBetter={false}
          history={historyFor(dayRecords, (r) => r.restingHeartRate)}
          asOf={view?.vitals.restingHeartRate.asOfShort}
          color="var(--recovery-low)"
        />
        <MetricTile
          label="SpO₂"
          value={view?.vitals.spo2.value}
          unit="%"
          decimals={1}
          delta={view?.deltas.spo2}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.spo2)}
          asOf={view?.vitals.spo2.asOfShort}
          color="var(--strain)"
        />
        <MetricTile
          label="Atemfrequenz"
          value={view?.vitals.breathingRate.value}
          unit="/min"
          decimals={1}
          delta={view?.deltas.breathingRate}
          higherIsBetter={false}
          history={historyFor(dayRecords, (r) => r.breathingRate)}
          asOf={view?.vitals.breathingRate.asOfShort}
          color="var(--sleep)"
        />
        <MetricTile
          label="VO₂max"
          value={view?.vitals.cardioFitness.value}
          unit="ml/kg/min"
          decimals={0}
          delta={view?.deltas.cardioFitness}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.cardioFitness)}
          asOf={view?.vitals.cardioFitness.asOfShort}
          color="var(--recovery)"
        />
        <MetricTile
          label="Schritte"
          value={view?.vitals.steps.value}
          unit=""
          decimals={0}
          delta={view?.deltas.steps}
          higherIsBetter
          history={historyFor(dayRecords, (r) => r.steps)}
          asOf={view?.vitals.steps.asOfShort}
          color="var(--strain)"
        />
      </div>

      <div className="section-label">
        Schlaf{view?.lastSleepAsOf ? ` · ${view.lastSleepAsOf}` : " letzte Nacht"}
      </div>
      <div className="card">
        {view?.lastSleepRecord?.sleepDurationMin ? (
          <>
            <div className="card-head" style={{ marginBottom: 16 }}>
              <div>
                <div className="eyebrow">Schlafdauer</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }} className="num">
                  {formatDuration(view.lastSleepRecord.sleepDurationMin)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="eyebrow">Effizienz</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }} className="num">
                  {view.lastSleepRecord.sleepEfficiency ?? "–"}%
                </div>
              </div>
            </div>

            <SleepStagesBar stages={view.lastSleepRecord.sleepStages} />

            <div style={{ marginTop: 16 }}>
              <div className="kv-row">
                <span className="muted">Zeit im Bett</span>
                <span className="value">{formatDuration(view.lastSleepRecord.timeInBedMin)}</span>
              </div>
              <div className="kv-row">
                <span className="muted">Einschlafzeit</span>
                <span className="value">
                  {formatClockMinutes(parseLocalClockMinutes(view.lastSleepRecord.sleepStartTime)) ?? "–"}
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
          <p className="empty-state">Noch keine Schlafdaten vorhanden</p>
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
            <span className="muted">Kalorien{view?.vitals.calories.asOf ? ` · ${view.vitals.calories.asOf}` : ""}</span>
            <span className="value">
              {Number.isFinite(view?.vitals.calories.value)
                ? `${Math.round(view.vitals.calories.value).toLocaleString("de-DE")} kcal`
                : "–"}
            </span>
          </div>
          <div className="kv-row">
            <span className="muted">
              Intensive Zonenminuten{view?.vitals.zoneMinutes.asOf ? ` · ${view.vitals.zoneMinutes.asOf}` : ""}
            </span>
            <span className="value">
              {view?.vitals.zoneMinutes.value ?? "–"}
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
