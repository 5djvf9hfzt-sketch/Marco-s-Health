import React, { useEffect, useState, useRef } from "react";
import { useAppState } from "./state/store.jsx";
import { handleRedirectCallback } from "./auth/fitbitAuth.js";
import Onboarding from "./screens/Onboarding.jsx";
import Home from "./screens/Home.jsx";
import Trends from "./screens/Trends.jsx";
import Lifestyle from "./screens/Lifestyle.jsx";
import Insights from "./screens/Insights.jsx";
import NavBar from "./components/NavBar.jsx";

export default function App() {
  const { state, actions } = useAppState();
  const [screen, setScreen] = useState("home");
  const [authStatus, setAuthStatus] = useState(null); // null | 'checking' | 'error'
  const [authErrorMessage, setAuthErrorMessage] = useState("");
  const hasTriggeredPostConnectSync = useRef(false);
  const hasTriggeredRoutineSync = useRef(false);

  // Einmalig beim App-Start prüfen, ob wir gerade von Fitbits
  // Zustimmungsseite zurückkommen (?code=...&state=...).
  useEffect(() => {
    (async () => {
      setAuthStatus("checking");
      const result = await handleRedirectCallback();
      if (result.status === "connected") {
        actions.setConnected(true);
      } else if (result.status === "error") {
        setAuthErrorMessage(result.message);
      }
      setAuthStatus(result.status);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsOnboarding = !state.connected || !state.profile || !state.lifestyle;

  // Direkt nachdem die Verbindung zu Fitbit steht (frisch verbunden ODER
  // App neu geöffnet mit bereits bestehender Verbindung, aber noch ohne
  // Onboarding-Daten), einmalig synchronisieren.
  useEffect(() => {
    if (state.bootstrapped && state.connected && !hasTriggeredPostConnectSync.current && needsOnboarding) {
      hasTriggeredPostConnectSync.current = true;
      actions.runSync().catch((err) => console.warn("Sync fehlgeschlagen:", err));
    }
  }, [state.bootstrapped, state.connected, needsOnboarding, actions]);

  // Sobald Onboarding abgeschlossen ist (Profil + Lifestyle vorhanden),
  // bei jedem App-Start genau einmal inkrementell synchronisieren + Bio-Age
  // ggf. neu berechnen (recomputeBioAge prüft selbst das 7-Tage-Intervall).
  useEffect(() => {
    if (state.bootstrapped && !needsOnboarding && !hasTriggeredRoutineSync.current) {
      hasTriggeredRoutineSync.current = true;
      actions
        .runSync()
        .catch((err) => console.warn("Sync fehlgeschlagen:", err))
        .finally(() => actions.recomputeBioAge());
    }
  }, [state.bootstrapped, needsOnboarding, actions]);

  if (!state.bootstrapped || authStatus === "checking") {
    return (
      <div className="centered-screen">
        <p>VitalSync wird geladen …</p>
      </div>
    );
  }

  if (needsOnboarding) {
    return <Onboarding authErrorMessage={authErrorMessage} />;
  }

  const screens = {
    home: <Home onNavigate={setScreen} />,
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
