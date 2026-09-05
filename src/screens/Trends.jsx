import React, { useMemo, useState } from "react";
import { useAppState } from "../state/store.jsx";
import TrendChart from "../components/TrendChart.jsx";
import { computeRecoveryScore, computeStrainScore, computeSleepScore } from "../models/scores.js";

const RANGES = [7, 30, 90];

export default function Trends() {
  const { state } = useAppState();
  const [rangeDays, setRangeDays] = useState(30);

  // Die Tagesscores werden für jeden Tag rückwirkend aus den Rohdaten
  // berechnet, damit sich auch Recovery/Strain/Schlaf als Verlauf darstellen
  // lassen (sie werden nicht gespeichert, sondern sind reine Ableitungen).
  const records = useMemo(
    () =>
      state.dayRecords.map((record) => ({
        ...record,
        recoveryScore: computeRecoveryScore(state.dayRecords, record.date)?.score,
        strainScore: computeStrainScore(state.dayRecords, record.date)?.score,
        sleepScore: computeSleepScore(state.dayRecords, record.date)?.score,
      })),
    [state.dayRecords]
  );

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Trends</h1>
          <p className="screen-subtitle">Verlauf relativ zu deiner Baseline</p>
        </div>
        <div className="segmented">
          {RANGES.map((range) => (
            <button key={range} className={rangeDays === range ? "active" : ""} onClick={() => setRangeDays(range)}>
              {range}T
            </button>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="empty-state">Noch keine synchronisierten Daten.</p>
      ) : (
        <>
          <div className="section-label">Tagesscores</div>
          <TrendChart
            id="t-recovery"
            label="Recovery"
            unit="%"
            records={records}
            accessor={(r) => r.recoveryScore}
            color="var(--recovery)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-sleep-score"
            label="Sleep Score"
            unit="%"
            records={records}
            accessor={(r) => r.sleepScore}
            color="var(--sleep)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-strain"
            label="Strain"
            unit="von 21"
            decimals={1}
            records={records}
            accessor={(r) => r.strainScore}
            color="var(--strain)"
            rangeDays={rangeDays}
          />

          <div className="section-label">Herz &amp; Kreislauf</div>
          <TrendChart
            id="t-hrv"
            label="Herzratenvariabilität"
            unit="ms"
            records={records}
            accessor={(r) => r.hrv}
            color="var(--recovery)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-rhr"
            label="Ruhepuls"
            unit="bpm"
            records={records}
            accessor={(r) => r.restingHeartRate}
            color="var(--recovery-low)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-vo2"
            label="Cardio Fitness (VO₂max)"
            unit="ml/kg/min"
            records={records}
            accessor={(r) => r.cardioFitness}
            color="#4dd6a1"
            rangeDays={rangeDays}
          />

          <div className="section-label">Schlaf</div>
          <TrendChart
            id="t-sleep-dur"
            label="Schlafdauer"
            unit="h"
            decimals={1}
            records={records}
            accessor={(r) => (Number.isFinite(r.sleepDurationMin) ? r.sleepDurationMin / 60 : undefined)}
            color="var(--sleep)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-sleep-eff"
            label="Schlafeffizienz"
            unit="%"
            records={records}
            accessor={(r) => r.sleepEfficiency}
            color="#b3a2ff"
            rangeDays={rangeDays}
          />

          <div className="section-label">Aktivität</div>
          <TrendChart
            id="t-steps"
            label="Schritte"
            unit=""
            records={records}
            accessor={(r) => r.steps}
            color="var(--strain)"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-zone"
            label="Intensive Zonenminuten"
            unit="min"
            records={records}
            accessor={(r) => r.moderateVigorousZoneMinutes ?? r.veryActiveMinutes}
            color="#5aa9ff"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-cal"
            label="Kalorienverbrauch"
            unit="kcal"
            records={records}
            accessor={(r) => r.calories}
            color="#ff9f5c"
            rangeDays={rangeDays}
          />

          <div className="section-label">Atmung</div>
          <TrendChart
            id="t-spo2"
            label="Sauerstoffsättigung"
            unit="%"
            decimals={1}
            records={records}
            accessor={(r) => r.spo2}
            color="#2e9bff"
            rangeDays={rangeDays}
          />
          <TrendChart
            id="t-br"
            label="Atemfrequenz"
            unit="/min"
            decimals={1}
            records={records}
            accessor={(r) => r.breathingRate}
            color="#8b6dff"
            rangeDays={rangeDays}
          />
        </>
      )}
    </div>
  );
}
