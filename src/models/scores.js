/**
 * Whoop-Style Tagesscores: Recovery, Strain, Sleep
 * ===================================================
 * Whoops tatsächlicher Algorithmus ist nicht öffentlich – die Formeln hier
 * sind eine nachvollziehbare, transparente Annäherung an das GRUNDPRINZIP
 * (HRV/Ruhepuls relativ zur Baseline, Herzfrequenzzonen-Zeit für die
 * Tagesbelastung, Dauer/Effizienz/Phasen/Konsistenz für den Schlaf), keine
 * Reproduktion des Originals.
 */

import { computeBaseline, zScore, computeSleepConsistencyStdDevMinutes } from "./baseline.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Wandelt einen Z-Score (-2..+2 typischer Bereich) in eine 0-100 Skala um, 0 = Baseline. */
function zScoreToScale(z) {
  return clamp(50 + z * 25, 0, 100);
}

// ---------------------------------------------------------------------------
// Recovery Score
// ---------------------------------------------------------------------------

/**
 * @param {Array} dayRecords Aufsteigend sortierte Tagesdaten (getDaysInRange-Format).
 * @param {string} targetDateIso Tag, für den der Recovery Score berechnet wird (i.d.R. heute).
 */
export function computeRecoveryScore(dayRecords, targetDateIso) {
  const today = dayRecords.find((r) => r.date === targetDateIso);
  if (!today) return null;

  const hrvBaseline = computeBaseline(dayRecords, (r) => r.hrv, { windowDays: 30, endDateIso: targetDateIso });
  const rhrBaseline = computeBaseline(dayRecords, (r) => r.restingHeartRate, {
    windowDays: 30,
    endDateIso: targetDateIso,
  });

  const hrvZ = zScore(today.hrv, hrvBaseline);
  // Niedrigerer Ruhepuls als Baseline ist GUT -> Vorzeichen umdrehen, damit
  // ein negativer RHR-Z-Score (Puls niedriger als üblich) den Score erhöht.
  const rhrZ = -zScore(today.restingHeartRate, rhrBaseline);

  const sleepScoreResult = computeSleepScore(dayRecords, targetDateIso);
  const sleepComponent = sleepScoreResult?.score ?? 50; // neutral, falls keine Schlafdaten vorhanden

  const hrvComponent = zScoreToScale(hrvZ);
  const rhrComponent = zScoreToScale(rhrZ);

  const score = Math.round(0.5 * hrvComponent + 0.3 * rhrComponent + 0.2 * sleepComponent);
  const clamped = clamp(score, 0, 100);

  const zone = clamped >= 67 ? "green" : clamped >= 34 ? "yellow" : "red";

  return {
    score: clamped,
    zone,
    hasEnoughBaseline: hrvBaseline.sampleSize >= 3 && rhrBaseline.sampleSize >= 3,
    components: { hrvComponent, rhrComponent, sleepComponent },
  };
}

// ---------------------------------------------------------------------------
// Strain Score (0-21, angelehnt an Whoops Skala)
// ---------------------------------------------------------------------------

export function computeStrainScore(dayRecords, targetDateIso) {
  const today = dayRecords.find((r) => r.date === targetDateIso);
  if (!today) return null;

  // Fat-Burn-Zone (leichte Belastung) zählt einfach, Cardio+Peak (hohe
  // Belastung) dreifach. Falls die Uhr keine Zonenminuten liefert, weichen
  // wir auf die gröberen "fairly/very active minutes" aus.
  const lightLoad = today.fatBurnZoneMinutes ?? today.fairlyActiveMinutes ?? 0;
  const hardLoad = today.moderateVigorousZoneMinutes ?? today.veryActiveMinutes ?? 0;
  const weightedLoad = lightLoad * 1 + hardLoad * 3;

  // Logarithmische Sättigungskurve: viele Minuten leichter Aktivität heben
  // den Strain nur noch wenig an, ganz analog zu Whoops Prinzip
  // "abnehmender Grenznutzen" bei sehr hoher Tagesbelastung.
  const strain = clamp(Math.log1p(weightedLoad * 0.6) * 4.2, 0, 21);

  return { score: Math.round(strain * 10) / 10, weightedLoad };
}

// ---------------------------------------------------------------------------
// Sleep Score (0-100)
// ---------------------------------------------------------------------------

function durationScore(minutesAsleep, baselineMinutes) {
  const reference = baselineMinutes ?? 480; // 8h Default-Referenz, falls (noch) keine persönliche Baseline vorhanden.
  return clamp((minutesAsleep / reference) * 100, 0, 100);
}

function efficiencyScore(efficiencyPercent) {
  return clamp(((efficiencyPercent - 60) / (98 - 60)) * 100, 0, 100);
}

function stageBalanceScore(stages) {
  if (!stages) return null;
  const total = (stages.deep ?? 0) + (stages.light ?? 0) + (stages.rem ?? 0) + (stages.wake ?? 0);
  if (total === 0) return null;
  const deepPct = (stages.deep ?? 0) / total;
  const remPct = (stages.rem ?? 0) / total;
  // Grobe "gesunde" Zielbereiche: Tiefschlaf ~13-23%, REM ~20-25% der Schlafzeit.
  const deepPenalty = clamp(Math.abs(deepPct - 0.18) * 300, 0, 50);
  const remPenalty = clamp(Math.abs(remPct - 0.225) * 200, 0, 50);
  return clamp(100 - deepPenalty - remPenalty, 0, 100);
}

function consistencyScoreFromStdDev(stdDevMinutes) {
  if (stdDevMinutes == null) return null;
  return clamp(((180 - stdDevMinutes) / 180) * 100, 0, 100);
}

export function computeSleepScore(dayRecords, targetDateIso) {
  const today = dayRecords.find((r) => r.date === targetDateIso);
  if (!today || !Number.isFinite(today.sleepDurationMin)) return null;

  const baseline = computeBaseline(dayRecords, (r) => r.sleepDurationMin, {
    windowDays: 30,
    endDateIso: targetDateIso,
  });

  const dScore = durationScore(today.sleepDurationMin, baseline.mean);
  const eScore = Number.isFinite(today.sleepEfficiency) ? efficiencyScore(today.sleepEfficiency) : null;
  const sScore = stageBalanceScore(today.sleepStages);
  const consistencyStdDev = computeSleepConsistencyStdDevMinutes(dayRecords, targetDateIso, 7);
  const cScore = consistencyScoreFromStdDev(consistencyStdDev);

  // Gewichte nur über tatsächlich verfügbare Teilscores normalisieren, statt
  // fehlende Komponenten stillschweigend als 0 zu werten.
  const weights = { duration: 0.35, efficiency: 0.3, stageBalance: 0.15, consistency: 0.2 };
  const parts = [
    [dScore, weights.duration],
    [eScore, weights.efficiency],
    [sScore, weights.stageBalance],
    [cScore, weights.consistency],
  ].filter(([value]) => value != null);

  const totalWeight = parts.reduce((sum, [, w]) => sum + w, 0);
  const score = totalWeight > 0 ? parts.reduce((sum, [value, w]) => sum + value * w, 0) / totalWeight : null;

  return {
    score: score != null ? Math.round(score) : null,
    components: { durationScore: dScore, efficiencyScore: eScore, stageBalanceScore: sScore, consistencyScore: cScore },
  };
}
