/**
 * Google Health API v4 Client
 * =============================
 * Direkte Browser-Aufrufe gegen https://health.googleapis.com/v4 – Google
 * liefert die nötigen CORS-Header, ein Proxy ist nicht erforderlich.
 *
 * Die hier verwendeten Pfade, Filter-Syntax, Feldnamen und Limits stammen aus
 * dem offiziellen Discovery-Dokument der API
 * (https://health.googleapis.com/$discovery/rest?version=v4, Revision
 * 20260828) sowie aus Googles quelloffenem ghealth-CLI (Apache-2.0).
 *
 * Es gibt drei relevante Operationen:
 *
 *  1. list        GET  /users/me/dataTypes/{typ}/dataPoints
 *                 Einzelmesswerte und Tageszusammenfassungen, gefiltert über
 *                 eine Filter-Ausdruck-Syntax, paginiert über pageToken.
 *
 *  2. dailyRollUp POST /users/me/dataTypes/{typ}/dataPoints:dailyRollUp
 *                 Tagessummen (Schritte, Kalorien, Zonenminuten). Nötig, weil
 *                 z.B. "steps list" nur Minutenintervalle OHNE Zählwerte
 *                 zurückgibt – die Summen gibt es ausschließlich im Rollup.
 *
 *  3. (reconcile) würde mehrere Datenquellen zusammenführen; VitalSync nutzt
 *                 es nicht, weil list/dailyRollUp für ein einzelnes Gerät
 *                 ausreichen und weniger Sonderfälle mitbringen.
 *
 * WICHTIGE EIGENHEITEN DER API (aus dem Discovery-Dokument):
 *  - Filter kennen NUR die Operatoren ">=" und "<" (kein "<=", kein ">").
 *  - Zahlenfelder mit int64 (z.B. minutesAsleep, countSum, beatsPerMinute)
 *    kommen als STRING, double-Felder (z.B. vo2Max, kcalSum) als Zahl.
 *  - Datumsangaben sind Objekte { year, month, day }, keine Strings.
 *  - Fehlende Tage bedeuten "nicht getragen/nicht synchronisiert" – NIEMALS 0.
 */

import { GOOGLE_CONFIG } from "../config.js";
import { getValidAccessToken } from "../auth/googleAuth.js";

/**
 * Registry der von VitalSync genutzten Datentypen.
 *
 * `filterName`  = snake_case-Name für Filterausdrücke
 * `timeField`   = bestimmt das Filterfeld:
 *                   "daily"    -> {typ}.date            (YYYY-MM-DD)
 *                   "interval" -> {typ}.interval.civil_start_time
 *                   "sleep"    -> sleep.interval.civil_end_time (Sonderfall:
 *                                 bei Schlaf ist nur die Endzeit filterbar)
 * `maxPageSize` = von der API erzwungene Obergrenze pro Seite
 * `rollupCapDays` = maximale Spanne pro dailyRollUp-Request
 */
export const DATA_TYPES = {
  dailyRestingHeartRate: { id: "daily-resting-heart-rate", filterName: "daily_resting_heart_rate", timeField: "daily" },
  dailyHrv: { id: "daily-heart-rate-variability", filterName: "daily_heart_rate_variability", timeField: "daily" },
  dailySpo2: { id: "daily-oxygen-saturation", filterName: "daily_oxygen_saturation", timeField: "daily" },
  dailyRespiratoryRate: { id: "daily-respiratory-rate", filterName: "daily_respiratory_rate", timeField: "daily" },
  dailyVo2Max: { id: "daily-vo2-max", filterName: "daily_vo2_max", timeField: "daily" },
  sleep: { id: "sleep", filterName: "sleep", timeField: "sleep", maxPageSize: 25 },
  steps: { id: "steps", rollupCapDays: 90 },
  totalCalories: { id: "total-calories", rollupCapDays: 14 },
  activeZoneMinutes: { id: "active-zone-minutes", rollupCapDays: 90 },
};

const DEFAULT_PAGE_SIZE = 1000;

async function authorizedFetch(path, { method = "GET", query, body } = {}) {
  const accessToken = await getValidAccessToken();
  const url = new URL(GOOGLE_CONFIG.apiBaseUrl + path);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value != null && value !== "") url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Health API ${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Filter-Ausdrücke
// ---------------------------------------------------------------------------

/**
 * Baut den Filterausdruck für einen Zeitraum. `endIso` ist EXKLUSIV, weil die
 * API nur "<" kennt – Aufrufer übergeben deshalb den Tag NACH dem letzten
 * gewünschten Tag.
 */
function buildTimeFilter(type, startIso, endIsoExclusive) {
  if (type.timeField === "daily") {
    return `${type.filterName}.date >= "${startIso}" AND ${type.filterName}.date < "${endIsoExclusive}"`;
  }
  if (type.timeField === "sleep") {
    // Schlaf lässt sich ausschließlich über die Endzeit filtern (civil time,
    // also ohne "Z"). Das passt gut: eine Nacht zählt zu dem Tag, an dem man
    // aufgewacht ist – dieselbe Zuordnung, die auch das Dashboard verwendet.
    return `sleep.interval.civil_end_time >= "${startIso}" AND sleep.interval.civil_end_time < "${endIsoExclusive}"`;
  }
  return `${type.filterName}.interval.civil_start_time >= "${startIso}" AND ${type.filterName}.interval.civil_start_time < "${endIsoExclusive}"`;
}

// ---------------------------------------------------------------------------
// Datums-Hilfsfunktionen
// ---------------------------------------------------------------------------

export function isoToCivilDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { date: { year, month, day } };
}

/** Formatiert ein { year, month, day }-Objekt der API als "YYYY-MM-DD". */
export function civilDateToIso(date) {
  if (!date) return null;
  const { year, month, day } = date;
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Zerlegt [startIso, endIso] in Blöcke von höchstens maxDays Tagen. */
function splitIntoChunks(startIso, endIso, maxDays) {
  const chunks = [];
  let chunkStart = startIso;
  while (chunkStart <= endIso) {
    let chunkEnd = addDays(chunkStart, maxDays - 1);
    if (chunkEnd > endIso) chunkEnd = endIso;
    chunks.push([chunkStart, chunkEnd]);
    chunkStart = addDays(chunkEnd, 1);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Operationen
// ---------------------------------------------------------------------------

/**
 * Holt alle Datenpunkte eines Typs im Zeitraum [startIso, endIso] (beide
 * inklusive) und folgt dabei automatisch der Seitennummerierung.
 */
export async function listDataPoints(type, startIso, endIso) {
  const filter = buildTimeFilter(type, startIso, addDays(endIso, 1));
  const pageSize = type.maxPageSize ?? DEFAULT_PAGE_SIZE;

  const collected = [];
  let pageToken = "";
  // Sicherheitsnetz gegen eine endlose Paginierungsschleife, falls die API
  // wider Erwarten immer denselben Token zurückgibt.
  for (let page = 0; page < 50; page += 1) {
    const json = await authorizedFetch(`/users/me/dataTypes/${type.id}/dataPoints`, {
      query: { filter, pageSize, pageToken },
    });
    collected.push(...(json.dataPoints ?? []));
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return collected;
}

/**
 * Holt Tagessummen eines Typs. Die API erwartet einen halboffenen
 * Civil-Time-Bereich, weshalb das Ende um einen Tag vorgerückt wird, damit
 * der letzte gewünschte Tag enthalten ist. windowSizeDays ist laut
 * Dokumentation optional, wird von der API aber tatsächlich erzwungen.
 */
export async function dailyRollUp(type, startIso, endIso) {
  const capDays = type.rollupCapDays ?? 90;
  const collected = [];

  for (const [chunkStart, chunkEnd] of splitIntoChunks(startIso, endIso, capDays)) {
    let pageToken = "";
    for (let page = 0; page < 50; page += 1) {
      const json = await authorizedFetch(`/users/me/dataTypes/${type.id}/dataPoints:dailyRollUp`, {
        method: "POST",
        body: {
          range: {
            start: isoToCivilDate(chunkStart),
            end: isoToCivilDate(addDays(chunkEnd, 1)),
          },
          windowSizeDays: 1,
          ...(pageToken ? { pageToken } : {}),
        },
      });
      collected.push(...(json.rollupDataPoints ?? []));
      pageToken = json.nextPageToken ?? "";
      if (!pageToken) break;
    }
  }
  return collected;
}
