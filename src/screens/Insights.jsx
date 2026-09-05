import React, { useMemo } from "react";
import { useAppState } from "../state/store.jsx";
import { computeBaseline, zScore } from "../models/baseline.js";
import { computeRecoveryScore } from "../models/scores.js";

const METRICS = [
  { key: "hrv", label: "HRV", accessor: (r) => r.hrv, goodDirection: "higher", unit: "ms" },
  { key: "restingHeartRate", label: "Ruhepuls", accessor: (r) => r.restingHeartRate, goodDirection: "lower", unit: "bpm" },
  { key: "sleepDurationMin", label: "Schlafdauer", accessor: (r) => r.sleepDurationMin, goodDirection: "higher", unit: "min" },
  { key: "steps", label: "Schritte", accessor: (r) => r.steps, goodDirection: "higher", unit: "Schritte" },
];

const Z_THRESHOLD = 1.5;
const MIN_BASELINE_SAMPLES = 5;

function generateInsights(dayRecords, latestDate, bioAge, recovery) {
  const insights = [];
  const today = dayRecords.find((r) => r.date === latestDate);

  if (today) {
    METRICS.forEach((metric) => {
      const value = metric.accessor(today);
      if (!Number.isFinite(value)) return;
      const baseline = computeBaseline(dayRecords, metric.accessor, { windowDays: 30, endDateIso: latestDate });
      if (baseline.sampleSize < MIN_BASELINE_SAMPLES) return;
      const z = zScore(value, baseline);
      if (Math.abs(z) < Z_THRESHOLD) return;

      const direction = z > 0 ? "höher" : "niedriger";
      const isGood = (metric.goodDirection === "higher" && z > 0) || (metric.goodDirection === "lower" && z < 0);
      insights.push({
        severity: isGood ? "good" : "warning",
        text: `${metric.label} heute deutlich ${direction} als dein 30-Tage-Durchschnitt (${Math.round(value)} vs. Ø ${Math.round(
          baseline.mean
        )} ${metric.unit}).`,
      });
    });
  }

  if (recovery && recovery.zone === "red") {
    insights.push({
      severity: "warning",
      text: "Deine Recovery ist heute niedrig – ein ruhigerer Tag könnte sinnvoll sein.",
    });
  }

  if (bioAge?.confidence === "low") {
    insights.push({
      severity: "info",
      text: "Noch nicht genug Fitbit-Daten für eine verlässliche Bio-Age-Schätzung – Konfidenz steigt mit jedem weiteren synchronisierten Tag.",
    });
  }

  if (insights.length === 0) {
    insights.push({ severity: "info", text: "Aktuell keine auffälligen Abweichungen von deiner Baseline." });
  }

  return insights;
}

const SEVERITY_COLOR = { warning: "var(--yellow)", good: "var(--green)", info: "var(--text-muted)" };

export default function Insights() {
  const { state } = useAppState();
  const latestDate = state.dayRecords.length ? state.dayRecords[state.dayRecords.length - 1].date : null;
  const recovery = latestDate ? computeRecoveryScore(state.dayRecords, latestDate) : null;

  const insights = useMemo(
    () => generateInsights(state.dayRecords, latestDate, state.bioAge, recovery),
    [state.dayRecords, latestDate, state.bioAge, recovery]
  );

  return (
    <div>
      <h1 className="screen-title">Insights</h1>
      <div className="card">
        {insights.map((insight, idx) => (
          <div key={idx} className="insight-item">
            <span className="insight-severity-dot" style={{ background: SEVERITY_COLOR[insight.severity] }} />
            <p>{insight.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
