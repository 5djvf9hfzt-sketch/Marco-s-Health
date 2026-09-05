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

  const sleepScoreResult = computeSleepScore(dayRecords, targetDateIso);

  const hrvComponent = Number.isFinite(today.hrv) ? zScoreToScale(zScore(today.hrv, hrvBaseline)) : null;
  // Niedrigerer Ruhepuls als Baseline ist GUT -> Vorzeichen umdrehen, damit
  // ein negativer RHR-Z-Score (Puls niedriger als üblich) den Score erhöht.
  const rhrComponent = Number.isFinite(today.restingHeartRate)
    ? zScoreToScale(-zScore(today.restingHeartRate, rhrBaseline))
    : null;
  const sleepComponent = sleepScoreResult?.score ?? null;

  // Nur tatsächlich vorhandene Komponenten fließen ein, die Gewichte werden
  // darüber normalisiert. Ohne HRV UND ohne Ruhepuls gibt es keinen
  // belastbaren Recovery-Wert – dann lieber "keine Daten" zeigen als eine
  // Zahl, die in Wahrheit nur den Schlaf oder gar nichts abbildet.
  if (hrvComponent == null && rhrComponent == null) return null;

  const parts = [
    [hrvComponent, 0.5],
    [rhrComponent, 0.3],
    [sleepComponent, 0.2],
  ].filter(([value]) => value != null);

  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  const score = clamp(Math.round(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight), 0, 100);

  const zone = score >= 67 ? "green" : score >= 34 ? "yellow" : "red";

  return {
    score,
    zone,
    hasEnoughBaseline: hrvBaseline.sampleSize >= 3 || rhrBaseline.sampleSize >= 3,
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
  const light = today.fatBurnZoneMinutes ?? today.fairlyActiveMinutes;
  const hard = today.moderateVigorousZoneMinutes ?? today.veryActiveMinutes;

  // Ohne jede Belastungsangabe ist "0 Strain" eine Falschaussage – dann gibt
  // es schlicht keinen Wert. Sind Werte vorhanden und 0, ist 0 dagegen korrekt.
  if (!Number.isFinite(light) && !Number.isFinite(hard)) return null;

  const lightLoad = Number.isFinite(light) ? light : 0;
  const hardLoad = Number.isFinite(hard) ? hard : 0;
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

/**
 * Empfohlener Schlafbedarf für Erwachsene (Orientierung: die gängige
 * Empfehlung von 7–9 Stunden pro Nacht, hier als Mittelwert 8h). Bewusst ein
 * fester Referenzwert statt des persönlichen Durchschnitts: wer chronisch zu
 * wenig schläft, hätte sonst automatisch einen "gedeckten" Bedarf.
 */
export const SLEEP_NEED_MINUTES = 480;

/**
 * Aufsummiertes Schlafdefizit der letzten `windowDays` Tage in Minuten.
 * Nächte ohne Daten werden übersprungen (kein fiktives Defizit für Tage,
 * an denen die Uhr nicht getragen wurde), Überschuss verrechnet sich nicht
 * mit dem Defizit anderer Nächte.
 */
export function computeSleepDebtMinutes(dayRecords, endDateIso, windowDays = 7) {
  const end = new Date(endDateIso + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays + 1);
  const startIso = start.toISOString().slice(0, 10);

  let debt = 0;
  let nights = 0;
  dayRecords
    .filter((r) => r.date >= startIso && r.date <= endDateIso)
    .forEach((r) => {
      if (!Number.isFinite(r.sleepDurationMin)) return;
      nights += 1;
      debt += Math.max(0, SLEEP_NEED_MINUTES - r.sleepDurationMin);
    });

  return nights > 0 ? { debtMinutes: Math.round(debt), nights } : null;
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
