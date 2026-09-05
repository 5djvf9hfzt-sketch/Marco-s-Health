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
  clientId: "DEINE_GOOGLE_CLIENT_ID.apps.googleusercontent.com",

  /**
   * OPTIONAL und im Normalfall leer lassen.
   *
   * Google stellt für "Webanwendung"-Clients zusätzlich ein Client-Secret aus.
   * Der PKCE-Flow ist genau dafür gemacht, OHNE dieses Secret auszukommen.
   * Falls Google den Token-Tausch trotzdem mit "client_secret is missing"
   * ablehnt, gibt es zwei Wege:
   *
   *   1. (empfohlen) Den mitgelieferten Cloudflare-Worker aus optional-token-helper/
   *      deployen, das Secret dort als verschlüsselte Variable hinterlegen und
   *      hier unten `tokenRelayUrl` eintragen. Das Secret bleibt dann geheim.
   *   2. (nicht empfohlen) Das Secret hier eintragen. Es landet damit im
   *      öffentlichen Browser-Code und im GitHub-Repository – Google sperrt
   *      öffentlich auffindbare Secrets unter Umständen automatisch.
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
