import React, { useMemo } from "react";
import { useAppState } from "../state/store.jsx";
import { computeBaseline, zScore, computeWeeklyActiveMinutes, computeSleepConsistencyStdDevMinutes } from "../models/baseline.js";
import { computeRecoveryScore, computeSleepDebtMinutes } from "../models/scores.js";
import Disclaimer from "../components/Disclaimer.jsx";

const Z_THRESHOLD = 1.5;
const MIN_BASELINE_SAMPLES = 5;
const WHO_WEEKLY_ACTIVE_MINUTES = 150;

const METRICS = [
  { label: "HRV", accessor: (r) => r.hrv, goodDirection: "higher", unit: "ms", decimals: 0 },
  { label: "Ruhepuls", accessor: (r) => r.restingHeartRate, goodDirection: "lower", unit: "bpm", decimals: 0 },
  { label: "Schlafdauer", accessor: (r) => r.sleepDurationMin, goodDirection: "higher", unit: "min", decimals: 0 },
  { label: "Atemfrequenz", accessor: (r) => r.breathingRate, goodDirection: "lower", unit: "/min", decimals: 1 },
  { label: "Sauerstoffsättigung", accessor: (r) => r.spo2, goodDirection: "higher", unit: "%", decimals: 1 },
  { label: "Schritte", accessor: (r) => r.steps, goodDirection: "higher", unit: "", decimals: 0 },
];

function num(value, decimals = 0) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function generateInsights(dayRecords, bioAge) {
  if (dayRecords.length === 0) {
    return [
      {
        severity: "info",
        title: "Noch keine Daten",
        text: "Sobald der erste Sync mit Google Health durchgelaufen ist, erscheinen hier automatisch Hinweise zu Abweichungen von deiner persönlichen Baseline.",
      },
    ];
  }

  const latestDate = dayRecords[dayRecords.length - 1].date;
  const today = dayRecords[dayRecords.length - 1];
  const insights = [];

  // 1. Abweichungen einzelner Messwerte vom 30-Tage-Durchschnitt
  METRICS.forEach((metric) => {
    const value = metric.accessor(today);
    if (!Number.isFinite(value)) return;
    const baseline = computeBaseline(dayRecords, metric.accessor, { windowDays: 30, endDateIso: latestDate });
    if (baseline.sampleSize < MIN_BASELINE_SAMPLES) return;
    const z = zScore(value, baseline);
    if (Math.abs(z) < Z_THRESHOLD) return;

    const isGood = (metric.goodDirection === "higher" && z > 0) || (metric.goodDirection === "lower" && z < 0);
    insights.push({
      severity: isGood ? "good" : "warning",
      title: `${metric.label} ${z > 0 ? "über" : "unter"} deinem Schnitt`,
      text: `Heute ${num(value, metric.decimals)}${metric.unit ? " " + metric.unit : ""} gegenüber einem 30-Tage-Durchschnitt von ${num(
        baseline.mean,
        metric.decimals
      )}${metric.unit ? " " + metric.unit : ""}. ${
        isGood ? "Das ist ein positives Signal." : "Häufige Ursachen sind Belastung, Schlafmangel, Alkohol oder eine beginnende Infektion."
      }`,
    });
  });

  // 2. Recovery-Zone
  const recovery = computeRecoveryScore(dayRecords, latestDate);
  if (recovery) {
    if (recovery.zone === "red") {
      insights.push({
        severity: "warning",
        title: "Recovery im roten Bereich",
        text: `Dein Recovery-Score liegt bei ${recovery.score}%. Dein Körper signalisiert Erholungsbedarf – ein ruhiger Tag oder lockeres Training ist heute meist die bessere Wahl.`,
      });
    } else if (recovery.zone === "green" && recovery.score >= 80) {
      insights.push({
        severity: "good",
        title: "Sehr gute Erholung",
        text: `Mit ${recovery.score}% Recovery bist du gut regeneriert – ein guter Tag für eine intensivere Einheit.`,
      });
    }
  }

  // 3. Schlafdefizit der letzten 7 Tage
  const sleepDebt = computeSleepDebtMinutes(dayRecords, latestDate, 7);
  if (sleepDebt && sleepDebt.debtMinutes >= 180) {
    insights.push({
      severity: "warning",
      title: "Schlafdefizit aufgebaut",
      text: `In den letzten ${sleepDebt.nights} erfassten Nächten fehlen dir insgesamt ${formatDuration(
        sleepDebt.debtMinutes
      )} gegenüber dem Richtwert von 8 Stunden pro Nacht.`,
    });
  }

  // 4. Schlafrhythmus-Konsistenz
  const consistency = computeSleepConsistencyStdDevMinutes(dayRecords, latestDate, 7);
  if (consistency != null && consistency > 90) {
    insights.push({
      severity: "warning",
      title: "Unregelmäßiger Schlafrhythmus",
      text: `Deine Einschlafzeit schwankt in den letzten 7 Tagen um ± ${Math.round(
        consistency
      )} Minuten. Ein gleichmäßigerer Rhythmus verbessert erfahrungsgemäß Schlafqualität und HRV.`,
    });
  }

  // 5. Wochenaktivität gegen die WHO-Empfehlung
  const weeklyActive = computeWeeklyActiveMinutes(dayRecords, latestDate, 7);
  if (weeklyActive != null) {
    if (weeklyActive < WHO_WEEKLY_ACTIVE_MINUTES * 0.6) {
      insights.push({
        severity: "warning",
        title: "Wenig intensive Aktivität",
        text: `${weeklyActive} von empfohlenen ${WHO_WEEKLY_ACTIVE_MINUTES} Zonenminuten in den letzten 7 Tagen. Schon zügiges Gehen zahlt auf dieses Ziel ein.`,
      });
    } else if (weeklyActive >= WHO_WEEKLY_ACTIVE_MINUTES) {
      insights.push({
        severity: "good",
        title: "Aktivitätsziel erreicht",
        text: `${weeklyActive} Zonenminuten in den letzten 7 Tagen – du liegst über der WHO-Empfehlung von ${WHO_WEEKLY_ACTIVE_MINUTES} Minuten.`,
      });
    }
  }

  // 6. Größter Hebel aus der Bio-Age-Berechnung
  if (bioAge?.breakdown) {
    const worst = bioAge.breakdown
      .filter((factor) => Number.isFinite(factor.years) && factor.years > 0.5)
      .sort((a, b) => b.years - a.years)[0];
    if (worst) {
      insights.push({
        severity: "info",
        title: `Größter Hebel: ${worst.label}`,
        text: `Dieser Faktor trägt aktuell ${num(worst.years, 1)} Jahre zu deinem biologischen Alter bei – der größte Einzelbeitrag in deiner Auswertung.`,
      });
    }
  }

  // 7. Datenlage
  if (bioAge?.confidence === "low") {
    insights.push({
      severity: "info",
      title: "Datenlage noch dünn",
      text: "Für eine belastbare Bio-Age-Schätzung fehlen noch Messtage. Die Konfidenz steigt automatisch mit jedem weiteren synchronisierten Tag.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      severity: "good",
      title: "Alles im gewohnten Rahmen",
      text: "Keine auffälligen Abweichungen von deiner persönlichen Baseline in den heutigen Werten.",
    });
  }

  return insights;
}

const STYLE = {
  warning: { color: "var(--recovery-mid)", background: "rgba(255,197,61,0.14)", icon: "!" },
  good: { color: "var(--recovery)", background: "rgba(22,224,163,0.14)", icon: "✓" },
  info: { color: "var(--strain)", background: "rgba(46,155,255,0.14)", icon: "i" },
};

export default function Insights() {
  const { state } = useAppState();
  const insights = useMemo(() => generateInsights(state.dayRecords, state.bioAge), [state.dayRecords, state.bioAge]);

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Insights</h1>
          <p className="screen-subtitle">Automatisch erkannte Auffälligkeiten</p>
        </div>
      </div>

      {insights.map((insight, index) => {
        const style = STYLE[insight.severity];
        return (
          <div className="insight-card" key={index}>
            <div className="insight-icon" style={{ background: style.background, color: style.color }}>
              {style.icon}
            </div>
            <div>
              <div className="insight-title">{insight.title}</div>
              <div className="insight-text">{insight.text}</div>
            </div>
          </div>
        );
      })}

      <Disclaimer />
    </div>
  );
}
