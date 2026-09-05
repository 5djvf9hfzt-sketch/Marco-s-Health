/**
 * Sync-Orchestrierung (Google Health API)
 * =========================================
 * Steuert, WANN und WIEVIEL geladen wird:
 *  - Erststart: 90 Tage Historie (INITIAL_BACKFILL_DAYS) für sofortige Baselines.
 *  - Danach: bei jedem App-Öffnen nur die Tage seit dem letzten Sync nachziehen.
 *
 * Alles läuft ausschließlich, wenn die App offen ist – es gibt bewusst keinen
 * Hintergrund-Sync, keinen Server-Cron-Job und keine Push-Benachrichtigungen.
 *
 * Diese Datei ist die EINZIGE Stelle, die das Antwortformat der Google Health
 * API kennt. Sie übersetzt es in das interne Tagesformat
 * ({ [YYYY-MM-DD]: { restingHeartRate, hrv, sleepDurationMin, ... } }), mit
 * dem alle Berechnungen (baseline.js, scores.js, biologicalAge.js) und die
 * gesamte Oberfläche arbeiten. Ein späterer Anbieterwechsel berührt deshalb
 * nur diese Datei und den API-Client daneben.
 *
 * Datenlücken: Fehlt für einen Tag ein Wert (Uhr nicht getragen/geladen),
 * lassen wir das Feld weg (undefined), statt 0 einzutragen. Google dokumentiert
 * ausdrücklich, dass ein fehlender Tag NICHT als Null zu lesen ist – ein
 * ausdrücklich gelieferter Wert "0" dagegen schon.
 */

import { INITIAL_BACKFILL_DAYS } from "../config.js";
import { DATA_TYPES, listDataPoints, dailyRollUp, civilDateToIso, addDays } from "./googleHealthApi.js";
import { getSyncState, setSyncState, setDays, getAllDays } from "../storage/db.js";

// Nach einem erfolgreichen Sync ziehen wir zusätzlich diese Anzahl Tage VOR
// dem letzten Sync nochmal nach, weil Werte nachträglich korrigiert werden
// können (z.B. Schlaf, der erst Stunden später fertig ausgewertet ist).
const INCREMENTAL_OVERLAP_DAYS = 3;

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** int64-Felder liefert die API als String, double-Felder als Zahl – beides sauber zu Number. */
function num(value) {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Extrahiert das Datum (YYYY-MM-DD) aus einem Zeitstempel. */
function localDateFromTimestamp(timestamp) {
  return typeof timestamp === "string" && timestamp.length >= 10 ? timestamp.slice(0, 10) : null;
}

/**
 * Rechnet einen UTC-Zeitstempel der API in die lokale Uhrzeit des Nutzers um.
 *
 * Die Google Health API liefert Zeitpunkte in UTC (z.B. "2026-09-04T21:41:30Z")
 * und den zugehörigen Zeitzonen-Versatz separat als Dauer (z.B. "7200s").
 * Für die Frage "wann bin ich eingeschlafen?" zählt aber die Uhr am
 * Handgelenk, nicht UTC. Wir geben deshalb einen Zeitstempel OHNE
 * Zeitzonen-Kennung zurück, dessen Uhrzeit bereits die lokale ist – genau das
 * Format, das die Auswertung der Schlaf-Konsistenz erwartet.
 */
function toLocalWallClock(utcTimestamp, utcOffset) {
  if (!utcTimestamp) return undefined;
  const parsed = Date.parse(utcTimestamp);
  if (!Number.isFinite(parsed)) return undefined;

  const offsetSeconds = Number(String(utcOffset ?? "0s").replace(/s$/, ""));
  const shifted = new Date(parsed + (Number.isFinite(offsetSeconds) ? offsetSeconds : 0) * 1000);
  return shifted.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:MM:SS", ohne "Z"
}

/**
 * Holt alle benötigten Datentypen für [startIso, endIso] und führt sie zu
 * einer { [date]: {...} }-Struktur zusammen. Jeder Typ wird einzeln
 * abgesichert: Liefert einer davon einen Fehler (fehlende Berechtigung, vom
 * Gerät nicht unterstützter Wert), läuft der Rest trotzdem durch.
 */
async function fetchAndMergeRange(startIso, endIso, onProgress) {
  const days = {};
  const errors = [];
  const ensure = (date) => {
    if (!days[date]) days[date] = {};
    return days[date];
  };

  const tasks = [
    {
      name: "Ruhepuls",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.dailyRestingHeartRate, startIso, endIso);
        points.forEach((p) => {
          const value = p.dailyRestingHeartRate;
          const date = civilDateToIso(value?.date);
          if (date) ensure(date).restingHeartRate = num(value.beatsPerMinute);
        });
      },
    },
    {
      name: "HRV",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.dailyHrv, startIso, endIso);
        points.forEach((p) => {
          const value = p.dailyHeartRateVariability;
          const date = civilDateToIso(value?.date);
          if (!date) return;
          const day = ensure(date);
          day.hrv = num(value.averageHeartRateVariabilityMilliseconds);
          day.hrvDeepSleep = num(value.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds);
        });
      },
    },
    {
      name: "Sauerstoffsättigung",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.dailySpo2, startIso, endIso);
        points.forEach((p) => {
          const value = p.dailyOxygenSaturation;
          const date = civilDateToIso(value?.date);
          if (date) ensure(date).spo2 = num(value.averagePercentage);
        });
      },
    },
    {
      name: "Atemfrequenz",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.dailyRespiratoryRate, startIso, endIso);
        points.forEach((p) => {
          const value = p.dailyRespiratoryRate;
          const date = civilDateToIso(value?.date);
          if (date) ensure(date).breathingRate = num(value.breathsPerMinute);
        });
      },
    },
    {
      name: "VO2max",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.dailyVo2Max, startIso, endIso);
        points.forEach((p) => {
          const value = p.dailyVo2Max;
          const date = civilDateToIso(value?.date);
          if (date) ensure(date).cardioFitness = num(value.vo2Max);
        });
      },
    },
    {
      name: "Schlaf",
      run: async () => {
        const points = await listDataPoints(DATA_TYPES.sleep, startIso, endIso);
        points.forEach((p) => {
          const sleep = p.sleep;
          if (!sleep) return;
          // Nickerchen und Teilschlafphasen ignorieren – uns interessiert die
          // Hauptschlafphase der Nacht, analog zur bisherigen Auswertung.
          if (sleep.metadata?.nap === true) return;
          if (sleep.metadata?.mainSleep === false) return;

          // Eine Nacht zählt zu dem Tag, an dem man aufgewacht ist.
          const date =
            civilDateToIso(sleep.interval?.civilEndTime?.date) ?? localDateFromTimestamp(sleep.interval?.endTime);
          if (!date) return;

          const day = ensure(date);
          const summary = sleep.summary ?? {};
          const minutesAsleep = num(summary.minutesAsleep);
          const minutesInBed = num(summary.minutesInSleepPeriod);

          day.sleepDurationMin = minutesAsleep;
          day.timeInBedMin = minutesInBed;
          day.minutesAwake = num(summary.minutesAwake);
          // Die Google Health API liefert keine fertige Schlafeffizienz –
          // wir berechnen sie wie üblich als Schlafzeit / Zeit im Bett.
          day.sleepEfficiency =
            minutesAsleep != null && minutesInBed > 0 ? Math.round((minutesAsleep / minutesInBed) * 100) : undefined;

          const stages = { deep: undefined, light: undefined, rem: undefined, wake: undefined };
          (summary.stagesSummary ?? []).forEach((stage) => {
            const minutes = num(stage.minutes);
            switch (stage.type) {
              case "DEEP":
                stages.deep = minutes;
                break;
              case "LIGHT":
              case "ASLEEP":
                stages.light = (stages.light ?? 0) + (minutes ?? 0);
                break;
              case "REM":
                stages.rem = minutes;
                break;
              case "AWAKE":
              case "RESTLESS":
                stages.wake = (stages.wake ?? 0) + (minutes ?? 0);
                day.awakeningsCount = num(stage.count) ?? day.awakeningsCount;
                break;
              default:
                break;
            }
          });
          day.sleepStages = stages;
          day.sleepStartTime = toLocalWallClock(sleep.interval?.startTime, sleep.interval?.startUtcOffset);
          day.sleepEndTime = toLocalWallClock(sleep.interval?.endTime, sleep.interval?.endUtcOffset);
        });
      },
    },
    {
      name: "Schritte",
      run: async () => {
        const points = await dailyRollUp(DATA_TYPES.steps, startIso, endIso);
        points.forEach((p) => {
          const date = civilDateToIso(p.civilStartTime?.date);
          const value = num(p.steps?.countSum);
          if (date && value !== undefined) ensure(date).steps = value;
        });
      },
    },
    {
      name: "Kalorien",
      run: async () => {
        const points = await dailyRollUp(DATA_TYPES.totalCalories, startIso, endIso);
        points.forEach((p) => {
          const date = civilDateToIso(p.civilStartTime?.date);
          const value = num(p.totalCalories?.kcalSum);
          if (date && value !== undefined) ensure(date).calories = value;
        });
      },
    },
    {
      name: "Zonenminuten",
      run: async () => {
        const points = await dailyRollUp(DATA_TYPES.activeZoneMinutes, startIso, endIso);
        points.forEach((p) => {
          const date = civilDateToIso(p.civilStartTime?.date);
          const zones = p.activeZoneMinutes;
          if (!date || !zones) return;
          const day = ensure(date);
          const fatBurn = num(zones.sumInFatBurnHeartZone);
          const cardio = num(zones.sumInCardioHeartZone);
          const peak = num(zones.sumInPeakHeartZone);

          // "Fat Burn" entspricht der leichten Belastung, Cardio + Peak der
          // moderaten bis intensiven – dieselbe Aufteilung wie bisher.
          if (fatBurn !== undefined) day.fatBurnZoneMinutes = fatBurn;
          if (cardio !== undefined || peak !== undefined) {
            day.moderateVigorousZoneMinutes = (cardio ?? 0) + (peak ?? 0);
          }
        });
      },
    },
  ];

  let completed = 0;
  for (const task of tasks) {
    try {
      await task.run();
    } catch (err) {
      errors.push(`${task.name}: ${err.message}`);
    }
    completed += 1;
    onProgress?.({ completed, total: tasks.length, currentEndpoint: task.name });
  }

  return { days, errors, totalEndpoints: tasks.length };
}

/** Läuft einmalig beim ersten erfolgreichen Login: lädt INITIAL_BACKFILL_DAYS Tage rückwirkend. */
export async function runInitialBackfill(onProgress) {
  const startIso = isoDaysAgo(INITIAL_BACKFILL_DAYS);
  const endIso = todayIso();

  const { days, errors, totalEndpoints } = await fetchAndMergeRange(startIso, endIso, onProgress);
  await setDays(days);

  // Nur wenn mindestens ein Datentyp geantwortet hat, gilt der Backfill als
  // erledigt. Sonst (offline, Token abgelaufen, Berechtigung fehlt) würde die
  // App den 90-Tage-Nachlauf nie wieder versuchen und dauerhaft mit einem
  // leeren Dashboard dastehen.
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
    ? addDays(state.lastSyncedDate, -INCREMENTAL_OVERLAP_DAYS)
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

/** Einstiegspunkt für die App: entscheidet selbst, ob Backfill oder Incremental-Sync nötig ist. */
export async function syncNow(onProgress) {
  const state = await getSyncState();
  return state.backfillComplete ? runIncrementalSync(onProgress) : runInitialBackfill(onProgress);
}

export async function hasAnyData() {
  const all = await getAllDays();
  return Object.keys(all).length > 0;
}
