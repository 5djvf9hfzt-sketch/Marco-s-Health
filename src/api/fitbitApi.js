/**
 * Fitbit Web API Client
 * =======================
 * Alle Calls laufen über den CORS-Relay (siehe fitbitAuth.js oben für die
 * Erklärung, warum das nötig ist). Jede Funktion holt sich vor dem Request
 * automatisch ein gültiges Access Token über getValidAccessToken().
 *
 * WICHTIG: Fitbit ändert seine Web API gelegentlich (z.B. wurde Sleep v1
 * zugunsten von v1.2 abgekündigt, und die komplette Web API wird laut
 * Fitbit/Google zum 30. September 2026 zugunsten der neuen Google Health API
 * abgeschaltet, siehe README "Ausblick: Migration"). Prüfe die Pfade hier
 * gegen https://dev.fitbit.com/build/reference/web-api/ falls ein Endpunkt
 * plötzlich 404/410 liefert.
 *
 * Fehlerverhalten: Jede *einzelne* Endpunkt-Abfrage wirft bei einem
 * HTTP-Fehler, wird aber von sync.js pro Endpunkt einzeln abgefangen –
 * ein einzelner nicht verfügbarer Datenpunkt (z.B. keine Cardio-Fitness-Werte,
 * weil die Uhr das nicht unterstützt) darf niemals den gesamten Sync
 * abbrechen.
 */

import { FITBIT_CONFIG } from "../config.js";
import { getValidAccessToken } from "../auth/fitbitAuth.js";

async function authorizedGet(path) {
  const accessToken = await getValidAccessToken();
  const response = await fetch(`${FITBIT_CONFIG.relayUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Fitbit API ${path} -> HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

/** Manche Fitbit-Zeitreihen-Endpunkte liefern ein Array direkt, andere ein
 * Objekt mit dem Array unter einem ressourcenspezifischen Key. Diese
 * Hilfsfunktion normalisiert beides auf ein einfaches Array. */
function unwrapSeries(json, possibleKeys) {
  if (Array.isArray(json)) return json;
  for (const key of possibleKeys) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Teilt [startIso, endIso] in Chunks von maximal maxChunkDays Tagen auf
 * (viele Fitbit-Endpunkte wie HRV/SpO2/Atemfrequenz/Cardio-Score erlauben
 * pro Request nur begrenzte Zeitspannen, z.B. 30 Tage). */
function splitIntoChunks(startIso, endIso, maxChunkDays) {
  const chunks = [];
  let chunkStart = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");

  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxChunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push([toIsoDate(chunkStart), toIsoDate(chunkEnd)]);
    chunkStart = new Date(chunkEnd);
    chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
  }
  return chunks;
}

async function fetchChunkedRange(pathTemplate, startIso, endIso, maxChunkDays, possibleKeys) {
  const chunks = splitIntoChunks(startIso, endIso, maxChunkDays);
  let combined = [];
  for (const [chunkStart, chunkEnd] of chunks) {
    const json = await authorizedGet(pathTemplate(chunkStart, chunkEnd));
    combined = combined.concat(unwrapSeries(json, possibleKeys));
  }
  return combined;
}

export async function getProfile() {
  const json = await authorizedGet("/1/user/-/profile.json");
  return json.user;
}

/** Ruhepuls + Zeit in Herzfrequenzzonen pro Tag. Range-Limit: 1 Jahr. */
export function getHeartRateSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/activities/heart/date/${s}/${e}.json`,
    startIso,
    endIso,
    366,
    ["activities-heart"]
  );
}

/** Schlafprotokolle inkl. Phasen (deep/light/rem/wake) + Effizienz. Range-Limit: 100 Tage. */
export function getSleepSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1.2/user/-/sleep/date/${s}/${e}.json`,
    startIso,
    endIso,
    100,
    ["sleep"]
  );
}

/** Tägliche Schritte. Range-Limit: 1 Jahr. */
export function getStepsSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/activities/steps/date/${s}/${e}.json`,
    startIso,
    endIso,
    366,
    ["activities-steps"]
  );
}

export function getFairlyActiveMinutesSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/activities/minutesFairlyActive/date/${s}/${e}.json`,
    startIso,
    endIso,
    366,
    ["activities-minutesFairlyActive"]
  );
}

export function getVeryActiveMinutesSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/activities/minutesVeryActive/date/${s}/${e}.json`,
    startIso,
    endIso,
    366,
    ["activities-minutesVeryActive"]
  );
}

/** Herzfrequenzvariabilität (RMSSD). Range-Limit: 30 Tage pro Request. */
export function getHrvSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/hrv/date/${s}/${e}.json`,
    startIso,
    endIso,
    30,
    ["hrv"]
  );
}

/** Sauerstoffsättigung (SpO2) während des Schlafs. Range-Limit: konservativ 30 Tage. */
export function getSpo2Series(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/spo2/date/${s}/${e}.json`,
    startIso,
    endIso,
    30,
    ["spo2"]
  );
}

/** Atemfrequenz während des Schlafs. Range-Limit: konservativ 30 Tage. */
export function getBreathingRateSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/br/date/${s}/${e}.json`,
    startIso,
    endIso,
    30,
    ["br"]
  );
}

/** Cardio Fitness Score (VO2max-Schätzung). Range-Limit: konservativ 30 Tage. Nicht jede Uhr/jeder Account liefert diesen Wert. */
export function getCardioScoreSeries(startIso, endIso) {
  return fetchChunkedRange(
    (s, e) => `/1/user/-/cardioscore/date/${s}/${e}.json`,
    startIso,
    endIso,
    30,
    ["cardioScore"]
  );
}
