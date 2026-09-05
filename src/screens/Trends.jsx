import React from "react";
import { useAppState } from "../state/store.jsx";
import TrendChart from "../components/TrendChart.jsx";

export default function Trends() {
  const { state } = useAppState();
  const records = state.dayRecords;

  return (
    <div>
      <h1 className="screen-title">Trends</h1>

      <TrendChart
        label="Herzratenvariabilität (HRV)"
        unit="ms"
        records={records}
        accessor={(r) => r.hrv}
      />
      <TrendChart
        label="Ruhepuls"
        unit="bpm"
        records={records}
        accessor={(r) => r.restingHeartRate}
      />
      <TrendChart
        label="Schlafdauer"
        unit="h"
        records={records}
        accessor={(r) => (Number.isFinite(r.sleepDurationMin) ? r.sleepDurationMin / 60 : undefined)}
      />
      <TrendChart
        label="Schritte"
        unit="Schritte"
        records={records}
        accessor={(r) => r.steps}
        formatValue={(v) => Math.round(v)}
      />
      <TrendChart
        label="Sauerstoffsättigung (SpO2)"
        unit="%"
        records={records}
        accessor={(r) => r.spo2}
      />
      <TrendChart
        label="Atemfrequenz"
        unit="Atemzüge/min"
        records={records}
        accessor={(r) => r.breathingRate}
      />
    </div>
  );
}
