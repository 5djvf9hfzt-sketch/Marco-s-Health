import React from "react";
import { useAppState } from "../state/store.jsx";
import BioAgeCard from "../components/BioAgeCard.jsx";
import RecoveryRing from "../components/RecoveryRing.jsx";
import StrainGauge from "../components/StrainGauge.jsx";
import Disclaimer from "../components/Disclaimer.jsx";
import { computeRecoveryScore, computeStrainScore } from "../models/scores.js";

export default function Home() {
  const { state, actions } = useAppState();

  const latestDate = state.dayRecords.length ? state.dayRecords[state.dayRecords.length - 1].date : null;
  const recovery = latestDate ? computeRecoveryScore(state.dayRecords, latestDate) : null;
  const strain = latestDate ? computeStrainScore(state.dayRecords, latestDate) : null;

  return (
    <div>
      <h1 className="screen-title">VitalSync</h1>

      <BioAgeCard bioAge={state.bioAge} chronologicalAge={state.profile?.chronologicalAge} />

      <div className="rings-row">
        <RecoveryRing recovery={recovery} />
        <StrainGauge strain={strain} />
      </div>

      <div className="card">
        <p className="card-label">Letzter Sync</p>
        <p>{state.syncState.lastSyncedDate ?? "Noch nie"}</p>
        {state.isSyncing && (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Synchronisiere{state.syncProgress ? ` (${state.syncProgress.completed}/${state.syncProgress.total})` : "…"}
          </p>
        )}
        {state.syncErrors.length > 0 && (
          <p style={{ color: "var(--yellow)", fontSize: 12 }}>
            Einige Datenpunkte konnten nicht geladen werden: {state.syncErrors.join("; ")}
          </p>
        )}
        <button className="secondary-button" disabled={state.isSyncing} onClick={() => actions.runSync()}>
          {state.isSyncing ? "Synchronisiere …" : "Jetzt aktualisieren"}
        </button>
      </div>

      <Disclaimer />
    </div>
  );
}
