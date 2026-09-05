/**
 * Globaler App-State (React Context + useReducer)
 * ==================================================
 * Bewusst kein Redux/Zustand/etc. – ein Context mit useReducer reicht für
 * den Umfang dieser App völlig aus ("minimale Komplexität"-Vorgabe). Der
 * State wird bei jeder relevanten Änderung in IndexedDB gespiegelt
 * (src/storage/db.js), sodass die App nach einem Neuladen bzw. beim
 * Öffnen aus dem Home-Bildschirm sofort mit den zuletzt bekannten Daten
 * startet (Offline-Fähigkeit).
 */

import React, { createContext, useContext, useEffect, useReducer, useCallback } from "react";
import * as db from "../storage/db.js";
import { isConnected as isFitbitConnected } from "../auth/fitbitAuth.js";
import { syncNow } from "../api/sync.js";
import { computeBiologicalAge } from "../models/biologicalAge.js";
import { computeBaseline, computeWeeklyActiveMinutes, computeSleepConsistencyStdDevMinutes, countDaysWithData } from "../models/baseline.js";

const BIO_AGE_RECOMPUTE_INTERVAL_DAYS = 7;

const initialState = {
  bootstrapped: false,
  connected: false,
  profile: null,
  lifestyle: null,
  lifestyleHistory: [],
  dayRecords: [], // aufsteigend sortiert, aus IndexedDB geladen
  syncState: { backfillComplete: false, lastSyncedDate: null },
  isSyncing: false,
  syncProgress: null,
  syncErrors: [],
  bioAge: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "BOOTSTRAP":
      return { ...state, ...action.payload, bootstrapped: true };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "SET_PROFILE":
      return { ...state, profile: action.payload };
    case "SET_LIFESTYLE":
      return { ...state, lifestyle: action.payload.lifestyle, lifestyleHistory: action.payload.history };
    case "SYNC_START":
      return { ...state, isSyncing: true, syncProgress: null, syncErrors: [] };
    case "SYNC_PROGRESS":
      return { ...state, syncProgress: action.payload };
    case "SYNC_DONE":
      return {
        ...state,
        isSyncing: false,
        syncProgress: null,
        syncErrors: action.payload.errors,
        dayRecords: action.payload.dayRecords,
        syncState: action.payload.syncState,
      };
    case "SET_BIO_AGE":
      return { ...state, bioAge: action.payload };
    default:
      return state;
  }
}

const AppStateContext = createContext(null);

async function loadDayRecordsSorted() {
  const all = await db.getAllDays();
  return Object.entries(all)
    .map(([date, metrics]) => ({ date, ...metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Baut die Eingabestruktur für computeBiologicalAge() aus den zuletzt bekannten Tagesdaten. */
function buildBioAgeInput(dayRecords, profile, lifestyle) {
  const endDateIso = dayRecords.length ? dayRecords[dayRecords.length - 1].date : todayIso();
  const windowDays = 30;

  const avg = (accessor) => computeBaseline(dayRecords, accessor, { windowDays, endDateIso }).mean;

  return {
    chronologicalAge: profile?.chronologicalAge ?? 40,
    avgRestingHeartRate: avg((r) => r.restingHeartRate) ?? undefined,
    avgHrv: avg((r) => r.hrv) ?? undefined,
    avgCardioFitness: avg((r) => r.cardioFitness) ?? undefined,
    avgSleepDurationHours: (() => {
      const m = avg((r) => r.sleepDurationMin);
      return m != null ? m / 60 : undefined;
    })(),
    avgSleepEfficiency: avg((r) => r.sleepEfficiency) ?? undefined,
    sleepConsistencyStdDevMinutes: computeSleepConsistencyStdDevMinutes(dayRecords, endDateIso, 7) ?? undefined,
    weeklyActiveMinutes: computeWeeklyActiveMinutes(dayRecords, endDateIso, 7) ?? undefined,
    avgSteps: avg((r) => r.steps) ?? undefined,
    avgSpo2: avg((r) => r.spo2) ?? undefined,
    avgBreathingRate: avg((r) => r.breathingRate) ?? undefined,
    lifestyle: lifestyle ?? undefined,
    daysOfData: countDaysWithData(dayRecords),
  };
}

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    (async () => {
      const [profile, lifestyleResult, dayRecords, syncState, bioAge] = await Promise.all([
        db.getProfile(),
        Promise.all([db.getLifestyle(), db.getLifestyleHistory()]),
        loadDayRecordsSorted(),
        db.getSyncState(),
        db.getBioAgeResult(),
      ]);
      const [lifestyle, lifestyleHistory] = lifestyleResult;
      dispatch({
        type: "BOOTSTRAP",
        payload: {
          connected: isFitbitConnected(),
          profile: profile ?? null,
          lifestyle: lifestyle ?? null,
          lifestyleHistory: lifestyleHistory ?? [],
          dayRecords,
          syncState,
          bioAge: bioAge ?? null,
        },
      });
    })();
  }, []);

  const setConnected = useCallback((value) => dispatch({ type: "SET_CONNECTED", payload: value }), []);

  const saveProfile = useCallback(async (profile) => {
    await db.setProfile(profile);
    dispatch({ type: "SET_PROFILE", payload: profile });
  }, []);

  const saveLifestyle = useCallback(async (lifestyle) => {
    const withTimestamp = { ...lifestyle, updatedAt: new Date().toISOString() };
    await db.setLifestyle(withTimestamp);
    const history = await db.appendLifestyleHistory(withTimestamp);
    dispatch({ type: "SET_LIFESTYLE", payload: { lifestyle: withTimestamp, history } });
  }, []);

  /** Führt einen Sync aus (Backfill beim ersten Mal, sonst inkrementell) und aktualisiert den State aus IndexedDB. */
  const runSync = useCallback(async () => {
    dispatch({ type: "SYNC_START" });
    try {
      const result = await syncNow((progress) => dispatch({ type: "SYNC_PROGRESS", payload: progress }));
      const dayRecords = await loadDayRecordsSorted();
      const syncState = await db.getSyncState();
      dispatch({ type: "SYNC_DONE", payload: { errors: result.errors, dayRecords, syncState } });
      return result;
    } catch (err) {
      dispatch({ type: "SYNC_DONE", payload: { errors: [err.message], dayRecords: state.dayRecords, syncState: state.syncState } });
      throw err;
    }
  }, [state.dayRecords, state.syncState]);

  /**
   * Berechnet das Bio-Age neu, wenn entweder noch nie berechnet wurde, die
   * letzte Berechnung > 7 Tage her ist, oder `force` gesetzt ist (z.B. nach
   * Bearbeiten des Lifestyle-Fragebogens, damit Änderungen sofort sichtbar sind).
   */
  const recomputeBioAge = useCallback(
    async ({ force = false } = {}) => {
      const last = state.bioAge?.computedAt ? new Date(state.bioAge.computedAt) : null;
      const daysSinceLast = last ? (Date.now() - last.getTime()) / 86_400_000 : Infinity;
      if (!force && daysSinceLast < BIO_AGE_RECOMPUTE_INTERVAL_DAYS) return state.bioAge;

      if (!state.profile) return null;
      const input = buildBioAgeInput(state.dayRecords, state.profile, state.lifestyle);
      const result = computeBiologicalAge(input);
      const withMeta = { ...result, computedAt: new Date().toISOString() };
      await db.setBioAgeResult(withMeta);
      dispatch({ type: "SET_BIO_AGE", payload: withMeta });
      return withMeta;
    },
    [state.bioAge, state.profile, state.lifestyle, state.dayRecords]
  );

  const value = {
    state,
    actions: { setConnected, saveProfile, saveLifestyle, runSync, recomputeBioAge },
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState muss innerhalb von <AppStateProvider> verwendet werden.");
  return ctx;
}
