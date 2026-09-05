/**
 * Speicherschicht (IndexedDB via idb-keyval)
 * ============================================
 * Kein externer Speicher, kein Backend – alles bleibt im Browser. Wir nutzen
 * IndexedDB statt localStorage für die Tagesmetriken, weil über ein Jahr
 * Historie (90 Tage Backfill + laufender Betrieb) schnell mehrere hundert KB
 * bis wenige MB JSON ergeben, und localStorage ist synchron (blockiert den
 * Main-Thread) sowie meist auf ~5MB pro Origin gedeckelt.
 *
 * Hinweis iOS/Safari: In normalem Safari können Website-Daten durch "Intelligent
 * Tracking Prevention" nach 7 Tagen Inaktivität gelöscht werden. Für PWAs, die
 * über "Zum Home-Bildschirm hinzufügen" installiert wurden (eigenständiger
 * Standalone-Modus), gilt diese Löschung NICHT – ein weiterer Grund, warum
 * dieses Projekt die Home-Bildschirm-Installation vorsieht statt reinem
 * Safari-Tab-Nutzen.
 *
 * Zwei getrennte Object-Stores:
 *  - "vitalsync-app"  -> wenige, kleine Einzelwerte (Profil, Lifestyle, Sync-Status, Bio-Age-Ergebnis)
 *  - "vitalsync-days" -> ein Eintrag pro Kalendertag mit allen Rohmetriken
 */

import { createStore, get, set, del, clear, entries, setMany } from "idb-keyval";

const appStore = createStore("vitalsync-app", "kv");
const daysStore = createStore("vitalsync-days", "kv");

// ---- App-weite Einzelwerte ----------------------------------------------

export const getProfile = () => get("profile", appStore);
export const setProfile = (profile) => set("profile", profile, appStore);

export const getLifestyle = () => get("lifestyle", appStore);
export const setLifestyle = (lifestyle) => set("lifestyle", lifestyle, appStore);

export const getLifestyleHistory = async () => (await get("lifestyleHistory", appStore)) ?? [];
export async function appendLifestyleHistory(entry) {
  const history = await getLifestyleHistory();
  const updated = [...history, entry];
  await set("lifestyleHistory", updated, appStore);
  return updated;
}

export const getSyncState = async () =>
  (await get("syncState", appStore)) ?? { backfillComplete: false, lastSyncedDate: null };
export const setSyncState = (state) => set("syncState", state, appStore);

export const getBioAgeResult = () => get("bioAgeResult", appStore);
export const setBioAgeResult = (result) => set("bioAgeResult", result, appStore);

// ---- Tagesmetriken --------------------------------------------------------

/** @returns {Promise<object|undefined>} Metriken für ein Datum (YYYY-MM-DD) oder undefined, wenn kein Eintrag existiert (= Datenlücke, z.B. Uhr nicht getragen). */
export const getDay = (dateIso) => get(dateIso, daysStore);

export const setDay = (dateIso, data) => set(dateIso, data, daysStore);

/** Schreibt mehrere Tage in einer einzigen IndexedDB-Transaktion (schneller als viele Einzel-set-Calls beim 90-Tage-Backfill). */
export const setDays = (entriesMap) => setMany(Object.entries(entriesMap), daysStore);

/** Liefert alle gespeicherten Tage als { [dateIso]: metrics } Objekt, aufsteigend sortiert. */
export async function getAllDays() {
  const allEntries = await entries(daysStore);
  const map = {};
  allEntries.forEach(([key, value]) => {
    map[key] = value;
  });
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Liefert nur Tage innerhalb [startIso, endIso] (inklusive), aufsteigend
 * sortiert, OHNE fehlende Tage künstlich aufzufüllen – Datenlücken (Uhr nicht
 * getragen/geladen) bleiben schlicht Lücken in der zurückgegebenen Liste und
 * dürfen von aufrufendem Code niemals als 0 interpretiert werden.
 */
export async function getDaysInRange(startIso, endIso) {
  const all = await getAllDays();
  return Object.entries(all)
    .filter(([date]) => date >= startIso && date <= endIso)
    .map(([date, metrics]) => ({ date, ...metrics }));
}

export async function clearAllData() {
  await clear(appStore);
  await clear(daysStore);
}

export { del as deleteDay };
