/**
 * Zentrale Konfiguration – hier trägst du deine eigenen Werte ein.
 * Alles hier ist öffentlich (landet im Browser-Bundle). Das ist bei einem
 * OAuth-"Client"-Typ (public client, PKCE) so vorgesehen: die Client-ID ist
 * kein Geheimnis, es gibt bei diesem App-Typ bewusst kein Client-Secret.
 */

export const FITBIT_CONFIG = {
  // Deine Fitbit "Client ID" aus dev.fitbit.com/apps -> deine App -> OAuth 2.0 Client ID.
  // Siehe README.md Abschnitt (a) für die genauen Schritte der App-Registrierung.
  clientId: "DEINE_FITBIT_CLIENT_ID",

  // Die URL deines CORS-Relay-Workers (siehe cors-relay/worker.js + README (b.1)).
  // Beispiel: "https://vitalsync-proxy.deinname.workers.dev"
  relayUrl: "https://DEIN-WORKER-NAME.workers.dev",

  // Muss 1:1 der Redirect-URI entsprechen, die du in der Fitbit-App-Konfiguration
  // eingetragen hast. Da VitalSync eine reine Single-Page-App ohne Router ist,
  // ist die Redirect-URI einfach die Startseite der App selbst.
  // Wird zur Laufzeit automatisch aus dem aktuellen Origin + Base-Pfad gebildet,
  // damit sie sowohl lokal (localhost) als auch auf GitHub Pages passt.
  get redirectUri() {
    return window.location.origin + import.meta.env.BASE_URL;
  },

  // Fitbit-Scopes, die VitalSync benötigt (siehe Aufgabenstellung).
  scopes: [
    "heartrate",
    "sleep",
    "activity",
    "profile",
    "oxygen_saturation",
    "respiratory_rate",
    "cardio_fitness",
  ],

  authorizeUrl: "https://www.fitbit.com/oauth2/authorize",
};

// Anzahl Tage, die beim allerersten Login rückwirkend geladen werden,
// um sofort eine sinnvolle Baseline für Recovery/Strain/Bio-Age zu haben.
export const INITIAL_BACKFILL_DAYS = 90;
