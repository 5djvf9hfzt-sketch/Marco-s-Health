/**
 * Baseline-Berechnungen
 * =======================
 * Whoop-Style Scores bewerten IMMER relativ zur eigenen 30-Tage-Baseline,
 * nicht zu festen Normwerten (z.B. "Ruhepuls 55" ist für den einen Nutzer
 * hervorragend, für einen anderen ungewöhnlich hoch). Alle Funktionen hier
 * ignorieren fehlende Tage (Datenlücken) einfach, statt sie als 0 zu werten
 * – ein fehlender Wert darf eine Baseline nie nach unten/oben verzerren.
 */

export function mean(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}

export function stdDev(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return 0;
  const avg = mean(finite);
  const variance = finite.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(variance);
}

/** dayRecords: aufsteigend sortiertes Array [{ date: "YYYY-MM-DD", ... }]. */
function filterRange(dayRecords, endDateIso, windowDays) {
  const end = new Date(endDateIso + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays + 1);
  const startIso = start.toISOString().slice(0, 10);
  return dayRecords.filter((r) => r.date >= startIso && r.date <= endDateIso);
}

/**
 * @param {Array} dayRecords
 * @param {(record) => number|undefined} accessor Extrahiert den relevanten Messwert aus einem Tages-Datensatz.
 * @param {{ windowDays: number, endDateIso: string }} options
 */
export function computeBaseline(dayRecords, accessor, { windowDays, endDateIso }) {
  const rangeRecords = filterRange(dayRecords, endDateIso, windowDays);
  const values = rangeRecords.map(accessor).filter((v) => Number.isFinite(v));
  return { mean: mean(values), stdDev: stdDev(values), sampleSize: values.length };
}

/**
 * Z-Score von value relativ zur Baseline. Bei zu wenig Datenpunkten (< 3)
 * liefern wir 0 (neutral) zurück, statt aus 1-2 Werten eine wacklige
 * Standardabweichung zu berechnen, die den Score künstlich extrem macht.
 */
export function zScore(value, baseline) {
  if (!Number.isFinite(value) || baseline.sampleSize < 3 || baseline.mean == null) return 0;
  const sd = baseline.stdDev || 1; // Division durch 0 vermeiden, falls alle Werte identisch waren.
  return (value - baseline.mean) / sd;
}

/**
 * Konsistenz der Einschlafzeit über die letzten 7 Tage (Standardabweichung
 * in Minuten). Zeiten nach Mitternacht (z.B. 00:30) werden als "+24h"
 * behandelt, damit z.B. 23:30 und 00:30 als nur 60 Minuten auseinander
 * gelten statt fälschlich als ~23 Stunden (Mitternachts-Wraparound).
 */
export function computeSleepConsistencyStdDevMinutes(dayRecords, endDateIso, windowDays = 7) {
  const rangeRecords = filterRange(dayRecords, endDateIso, windowDays);
  const minutesSinceMidnight = rangeRecords
    .map((r) => r.sleepStartTime)
    .filter(Boolean)
    .map((iso) => {
      const d = new Date(iso);
      const totalMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
      // Vor Mittag = "spät in der Nacht" (nach Mitternacht eingeschlafen) -> +24h verschieben.
      return totalMinutes < 12 * 60 ? totalMinutes + 24 * 60 : totalMinutes;
    });
  if (minutesSinceMidnight.length < 2) return null;
  return stdDev(minutesSinceMidnight);
}

/** Summe der bekannten aktiven Minuten der letzten `windowDays` Tage – KEINE Hochrechnung bei Lücken. */
export function computeWeeklyActiveMinutes(dayRecords, endDateIso, windowDays = 7) {
  const rangeRecords = filterRange(dayRecords, endDateIso, windowDays);
  let total = 0;
  let any = false;
  rangeRecords.forEach((r) => {
    const moderateVigorous = r.moderateVigorousZoneMinutes ?? r.veryActiveMinutes;
    if (Number.isFinite(moderateVigorous)) {
      total += moderateVigorous;
      any = true;
    }
  });
  return any ? total : null;
}

/** Anzahl Tage mit mindestens einem gespeicherten Fitbit-Messwert (Basis für den Confidence-Indikator). */
export function countDaysWithData(dayRecords) {
  return dayRecords.filter((r) =>
    [
      r.restingHeartRate,
      r.hrv,
      r.sleepDurationMin,
      r.steps,
      r.spo2,
      r.breathingRate,
      r.cardioFitness,
    ].some((v) => Number.isFinite(v))
  ).length;
}
