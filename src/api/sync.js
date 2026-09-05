/**
 * Sync-Orchestrierung
 * =====================
 * Steuert, WANN und WIEVIEL von Fitbit geladen wird:
 *  - Erststart: 90 Tage Historie (INITIAL_BACKFILL_DAYS) für sofortige Baselines.
 *  - Danach: bei jedem App-Öffnen nur die Tage seit dem letzten Sync nachziehen.
 *
 * Alles läuft ausschließlich, wenn die App offen ist ("wenn die App geöffnet
 * wird") – es gibt bewusst keinen Hintergrund-Sync, keinen Server-Cron-Job,
 * keine Push-Benachrichtigungen. Ein Service Worker kann Daten NICHT im
 * Hintergrund von Fitbit nachladen, wenn die App geschlossen ist – das ist
 * technisch gar nicht vorgesehen (kein Backend, das das anstoßen könnte).
 *
 * Datenlücken: Wenn Fitbit für einen Tag z.B. keinen Schlafeintrag hat (Uhr
 * nicht getragen/nicht geladen), lassen wir dieses Feld für den Tag einfach
 * weg (undefined), statt 0 einzutragen. Downstream-Berechnungen
 * (baseline.js, scores.js, biologicalAge.js) müssen defensiv mit fehlenden
 * Feldern umgehen und dürfen sie nie als "0 = schlechtester Wert" fehlinterpretieren.
 */

import { INITIAL_BACKFILL_DAYS } from "../config.js";
import * as api from "./fitbitApi.js";
import { getSyncState, setSyncState, setDays, getAllDays } from "../storage/db.js";

// Nach einem erfolgreichen Sync ziehen wir zusätzlich diese Anzahl Tage VOR
// dem letzten Sync nochmal nach. Grund: Fitbit korrigiert Tageswerte
// manchmal nachträglich (z.B. Schlaf, der über Mitternacht hinausgeht und
// erst Stunden später final berechnet wird), ein reiner "ab morgen"-Sync
// würde solche Nachkorrekturen sonst dauerhaft verpassen.
const INCREMENTAL_OVERLAP_DAYS = 3;

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** cardioScore.value.vo2Max kommt teils als Bereich ("42-46"), teils als
 * Einzelwert – wir nehmen im Bereichsfall den Mittelwert. */
function parseVo2Max(raw) {
  if (raw == null) return undefined;
  const str = String(raw);
  if (str.includes("-")) {
    const [lo, hi] = str.split("-").map(Number);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
    return undefined;
  }
  return toNumberOrUndefined(str);
}

function sumZoneMinutes(heartRateZones, zoneNames) {
  if (!Array.isArray(heartRateZones)) return undefined;
  const relevant = heartRateZones.filter((z) => zoneNames.includes(z.name));
  if (relevant.length === 0) return undefined;
  return relevant.reduce((sum, z) => sum + (z.minutes ?? 0), 0);
}

/**
 * Holt alle Fitbit-Endpunkte für [startIso, endIso] parallel und führt sie zu
 * einer { [date]: {...} } Struktur zusammen. Jeder einzelne Endpunkt wird
 * separat abgefangen (Promise.allSettled) – z.B. wenn ein Account keine
 * Cardio-Fitness-Werte liefert, soll das nicht den kompletten Sync stoppen.
 */
async function fetchAndMergeRange(startIso, endIso, onProgress) {
  const tasks = [
    ["heart", api.getHeartRateSeries],
    ["sleep", api.getSleepSeries],
    ["steps", api.getStepsSeries],
    ["calories", api.getCaloriesSeries],
    ["fairlyActive", api.getFairlyActiveMinutesSeries],
    ["veryActive", api.getVeryActiveMinutesSeries],
    ["hrv", api.getHrvSeries],
    ["spo2", api.getSpo2Series],
    ["breathingRate", api.getBreathingRateSeries],
    ["cardioScore", api.getCardioScoreSeries],
  ];

  const days = {}; // date -> partial metrics
  const errors = [];

  const ensure = (date) => {
    if (!days[date]) days[date] = {};
    return days[date];
  };

  let completed = 0;
  for (const [name, fn] of tasks) {
    try {
      const series = await fn(startIso, endIso);

      if (name === "heart") {
        series.forEach((entry) => {
          const day = ensure(entry.dateTime);
          day.restingHeartRate = toNumberOrUndefined(entry.value?.restingHeartRate);
          day.moderateVigorousZoneMinutes = sumZoneMinutes(entry.value?.heartRateZones, ["Cardio", "Peak"]);
          day.fatBurnZoneMinutes = sumZoneMinutes(entry.value?.heartRateZones, ["Fat Burn"]);
        });
      } else if (name === "sleep") {
        series
          .filter((entry) => entry.isMainSleep !== false)
          .forEach((entry) => {
            const date = entry.dateOfSleep ?? entry.dateTime;
            if (!date) return;
            const day = ensure(date);
            const summary = entry.levels?.summary ?? {};
            day.sleepDurationMin = toNumberOrUndefined(entry.minutesAsleep);
            day.sleepEfficiency = toNumberOrUndefined(entry.efficiency);
            day.timeInBedMin = toNumberOrUndefined(entry.timeInBed);
            day.minutesAwake = toNumberOrUndefined(entry.minutesAwake);
            day.awakeningsCount = toNumberOrUndefined(summary.wake?.count);
            day.sleepStages = {
              deep: toNumberOrUndefined(summary.deep?.minutes),
              light: toNumberOrUndefined(summary.light?.minutes),
              rem: toNumberOrUndefined(summary.rem?.minutes),
              wake: toNumberOrUndefined(summary.wake?.minutes),
            };
            day.sleepStartTime = entry.startTime;
            day.sleepEndTime = entry.endTime;
          });
      } else if (name === "steps") {
        series.forEach((entry) => {
          ensure(entry.dateTime).steps = toNumberOrUndefined(entry.value);
        });
      } else if (name === "calories") {
        series.forEach((entry) => {
          ensure(entry.dateTime).calories = toNumberOrUndefined(entry.value);
        });
      } else if (name === "fairlyActive") {
        series.forEach((entry) => {
          ensure(entry.dateTime).fairlyActiveMinutes = toNumberOrUndefined(entry.value);
        });
      } else if (name === "veryActive") {
        series.forEach((entry) => {
          ensure(entry.dateTime).veryActiveMinutes = toNumberOrUndefined(entry.value);
        });
      } else if (name === "hrv") {
        series.forEach((entry) => {
          const day = ensure(entry.dateTime);
          day.hrv = toNumberOrUndefined(entry.value?.dailyRmssd);
          day.hrvDeepSleep = toNumberOrUndefined(entry.value?.deepRmssd);
        });
      } else if (name === "spo2") {
        series.forEach((entry) => {
          const date = entry.dateTime;
          if (!date) return;
          const value = entry.value ?? entry;
          ensure(date).spo2 = toNumberOrUndefined(value.avg);
        });
      } else if (name === "breathingRate") {
        series.forEach((entry) => {
          const date = entry.dateTime;
          if (!date) return;
          const value = entry.value ?? entry;
          ensure(date).breathingRate = toNumberOrUndefined(value.breathingRate ?? value.fullSleepSummary?.breathingRate);
        });
      } else if (name === "cardioScore") {
        series.forEach((entry) => {
          const date = entry.dateTime;
          if (!date) return;
          const values = Array.isArray(entry.value) ? entry.value : [entry.value];
          const vo2Max = parseVo2Max(values?.[0]?.vo2Max);
          if (vo2Max !== undefined) ensure(date).cardioFitness = vo2Max;
        });
      }
    } catch (err) {
      // Ein fehlender Scope, eine nicht unterstützte Uhr oder ein temporärer
      // Fitbit-Fehler bei EINEM Endpunkt darf den restlichen Sync nicht stoppen.
      errors.push(`${name}: ${err.message}`);
    }
    completed += 1;
    onProgress?.({ completed, total: tasks.length, currentEndpoint: name });
  }

  return { days, errors, totalEndpoints: tasks.length };
}

/** Läuft einmalig beim ersten erfolgreichen Login: lädt INITIAL_BACKFILL_DAYS Tage rückwirkend. */
export async function runInitialBackfill(onProgress) {
  const startIso = isoDaysAgo(INITIAL_BACKFILL_DAYS);
  const endIso = todayIso();

  const { days, errors, totalEndpoints } = await fetchAndMergeRange(startIso, endIso, onProgress);
  await setDays(days);

  // Nur wenn mindestens ein Endpunkt geantwortet hat, gilt der Backfill als
  // erledigt. Sonst (z.B. Relay nicht erreichbar, Token abgelaufen, offline)
  // würde die App den 90-Tage-Nachlauf nie wieder versuchen und dauerhaft mit
  // einem leeren Dashboard dastehen.
  if (errors.length < totalEndpoints) {
    await setSyncState({ backfillComplete: true, lastSyncedDate: endIso });
  }

  return { daysSynced: Object.keys(days).length, errors };
}

/** Läuft bei jedem weiteren App-Start: zieht nur neue/kürzlich geänderte Tage nach. */
export async function runIncrementalSync(onProgress) {
  const state = await getSyncState();
  if (!state.backfillComplete) {
    return runInitialBackfill(onProgress);
  }

  const overlapStart = state.lastSyncedDate
    ? new Date(new Date(state.lastSyncedDate).getTime() - INCREMENTAL_OVERLAP_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : isoDaysAgo(INCREMENTAL_OVERLAP_DAYS);
  const endIso = todayIso();

  const { days, errors, totalEndpoints } = await fetchAndMergeRange(overlapStart, endIso, onProgress);
  await setDays(days);

  // lastSyncedDate nur vorrücken, wenn überhaupt etwas geladen wurde – sonst
  // würden die übersprungenen Tage beim nächsten Start nicht mehr abgefragt.
  if (errors.length < totalEndpoints) {
    await setSyncState({ backfillComplete: true, lastSyncedDate: endIso });
  }

  return { daysSynced: Object.keys(days).length, errors };
}

/** Bequemer Einstiegspunkt für App.jsx: entscheidet selbst, ob Backfill oder Incremental-Sync nötig ist. */
export async function syncNow(onProgress) {
  const state = await getSyncState();
  return state.backfillComplete ? runIncrementalSync(onProgress) : runInitialBackfill(onProgress);
}

export async function hasAnyData() {
  const all = await getAllDays();
  return Object.keys(all).length > 0;
}
