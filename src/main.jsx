import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AppStateProvider } from "./state/store.jsx";
import "./styles/global.css";

// Service Worker registrieren (Offline-Fähigkeit + "Zum Home-Bildschirm
// hinzufügen"-Support auf iOS). import.meta.env.BASE_URL sorgt dafür, dass
// der Pfad sowohl lokal (/) als auch auf GitHub Pages (/<repo-name>/) passt.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn("Service Worker Registrierung fehlgeschlagen:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </React.StrictMode>
);
