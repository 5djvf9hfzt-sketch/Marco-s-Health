/**
 * Zentrale Konfiguration – hier trägst du deine eigenen Werte ein.
 *
 * VitalSync nutzt die **Google Health API v4** (health.googleapis.com), den
 * Nachfolger der zum 30.09.2026 abgeschalteten Fitbit Web API. Deine
 * Fitbit-Uhr liefert ihre Daten weiterhin – sie fließen nach der Umstellung
 * deines Fitbit-Kontos auf ein Google-Konto in die Google Health API.
 *
 * Anders als Fitbit unterstützt Google CORS: Die App spricht Login und API
 * direkt aus dem Browser an, ganz ohne Server oder Proxy.
 */

export const GOOGLE_CONFIG = {
  // Deine OAuth-Client-ID aus der Google Cloud Console
  // (APIs & Dienste → Anmeldedaten → OAuth-Client-ID, Typ "Webanwendung").
  // Sie ist kein Geheimnis – bei einem PKCE-Flow steht sie immer im Browser.
  // Siehe README.md Abschnitt (a) für die Schritt-für-Schritt-Anleitung.
  clientId: "549302552201-omrca0s37bstlc7vs86o7hmfqu1jj83c.apps.googleusercontent.com",

  /**
   * DER SCHALTER ZWISCHEN DEN BEIDEN LOGIN-VERFAHREN (siehe googleAuth.js).
   *
   * LEER (Standard) -> Impliziter Flow, komplett ohne Server.
   *   Google liefert das Access-Token direkt zurück, es gibt keinen
   *   Token-Tausch und damit auch kein Client-Secret-Problem. Das Token gilt
   *   eine Stunde; danach holt die App beim Start still ein neues.
   *
   * GESETZT -> Authorization Code Flow mit PKCE über den Mini-Worker aus
   *   optional-token-helper/, der das Client-Secret serverseitig ergänzt.
   *   Dafür gibt es Refresh-Tokens und einen Login, der im Hintergrund hält.
   *   Beispiel: "https://vitalsync-token.deinname.workers.dev"
   *
   * Das Client-Secret gehört NIEMALS hierher – diese Datei landet im
   * öffentlichen Browser-Code und im GitHub-Repository. Google sperrt
   * öffentlich auffindbare Secrets unter Umständen automatisch.
   */
  tokenRelayUrl: "",

  // Google-Health-Berechtigungen, die VitalSync benötigt (nur lesend).
  // Die drei Kategorien decken alle im Dashboard genutzten Werte ab:
  //  - activity_and_fitness: Schritte, Zonenminuten, Kalorien, VO2max
  //  - health_metrics_and_measurements: Ruhepuls, HRV, SpO2, Atemfrequenz
  //  - sleep: Schlafdauer, -phasen und -zeiten
  scopes: [
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  ],

  // Muss exakt einer der "Autorisierten Weiterleitungs-URIs" in deiner
  // Google-OAuth-Client-Konfiguration entsprechen. VitalSync ist eine
  // Single-Page-App ohne Router, deshalb ist die Weiterleitungsadresse
  // schlicht die Startseite selbst. Wird zur Laufzeit aus dem aktuellen
  // Origin + Base-Pfad gebildet, damit sie lokal wie auf GitHub Pages passt.
  get redirectUri() {
    return window.location.origin + import.meta.env.BASE_URL;
  },

  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  apiBaseUrl: "https://health.googleapis.com/v4",
};

// Anzahl Tage, die beim allerersten Login rückwirkend geladen werden,
// um sofort eine sinnvolle Baseline für Recovery/Strain/Bio-Age zu haben.
export const INITIAL_BACKFILL_DAYS = 90;
