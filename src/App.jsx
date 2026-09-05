import React, { useEffect, useState, useRef } from "react";
import { useAppState } from "./state/store.jsx";
import { handleRedirectCallback } from "./auth/googleAuth.js";
import Onboarding from "./screens/Onboarding.jsx";
import Home from "./screens/Home.jsx";
import Trends from "./screens/Trends.jsx";
import Lifestyle from "./screens/Lifestyle.jsx";
import Insights from "./screens/Insights.jsx";
import NavBar from "./components/NavBar.jsx";

export default function App() {
  const { state, actions } = useAppState();
  const [screen, setScreen] = useState("home");
  const [authStatus, setAuthStatus] = useState("checking");
  const [authErrorMessage, setAuthErrorMessage] = useState("");
  const hasSynced = useRef(false);

  // Einmalig beim App-Start prüfen, ob wir gerade von Googles
  // Zustimmungsseite zurückkommen (?code=...&state=...).
  useEffect(() => {
    (async () => {
      const result = await handleRedirectCallback();
      if (result.status === "connected") {
        actions.setConnected(true);
      } else if (result.status === "error") {
        setAuthErrorMessage(result.message);
      }
      setAuthStatus(result.status);
    })();
  }, [actions]);

  // Genau ein Sync pro App-Start, sobald eine Google-Verbindung besteht.
  // Beim ersten Mal ist das der 90-Tage-Backfill, danach nur noch die neuen
  // Tage. Läuft bewusst schon während des Onboardings mit, damit die Historie
  // bereits geladen ist, wenn der Nutzer den Fragebogen abgeschlossen hat.
  useEffect(() => {
    if (!state.bootstrapped || !state.connected || hasSynced.current) return;
    hasSynced.current = true;
    actions.runSync().catch((err) => console.warn("Sync fehlgeschlagen:", err));
  }, [state.bootstrapped, state.connected, actions]);

  // Bio-Age berechnen, sobald Profil, Fragebogen und Daten vorliegen – und
  // erneut, wenn ein Sync neue Messtage gebracht hat. recomputeBioAge()
  // entscheidet selbst, ob eine Neuberechnung nötig ist (Wochenintervall bzw.
  // gewachsene Datenlage), deshalb ist ein häufigerer Aufruf unschädlich und
  // es braucht hier bewusst KEINE Einmal-Sperre.
  useEffect(() => {
    if (!state.bootstrapped || state.isSyncing) return;
    if (!state.profile || !state.lifestyle) return;
    actions.recomputeBioAge().catch((err) => console.warn("Bio-Age-Berechnung fehlgeschlagen:", err));
  }, [state.bootstrapped, state.isSyncing, state.profile, state.lifestyle, state.dayRecords, actions]);

  if (!state.bootstrapped || authStatus === "checking") {
    return (
      <div className="centered-screen">
        <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
        <p style={{ marginTop: 16 }}>VitalSync wird geladen …</p>
      </div>
    );
  }

  const needsOnboarding = !state.connected || !state.profile || !state.lifestyle;
  if (needsOnboarding) {
    return <Onboarding authErrorMessage={authErrorMessage} />;
  }

  const screens = {
    home: <Home />,
    trends: <Trends />,
    lifestyle: <Lifestyle />,
    insights: <Insights />,
  };

  return (
    <div className="app-shell">
      <div className="app-content">{screens[screen]}</div>
      <NavBar current={screen} onNavigate={setScreen} />
    </div>
  );
}
