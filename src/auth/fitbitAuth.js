/**
 * Fitbit OAuth 2.0 – Authorization Code Flow with PKCE
 * =======================================================
 *
 * Kompletter clientseitiger Login-Flow ohne Backend und ohne Client-Secret.
 * Das ist möglich, weil Fitbit-Apps vom Typ "Client" (im Gegensatz zu
 * "Server") explizit für genau diesen Fall gedacht sind: Apps, die ihr
 * Geheimnis nicht sicher aufbewahren können (SPAs, Mobile-Apps), verzichten
 * auf ein Client-Secret und sichern den Flow stattdessen über PKCE ab
 * (siehe pkce.js für die Erklärung, WARUM das sicher ist).
 *
 * WICHTIG – CORS: Fitbits Token-Endpunkt und Daten-API senden keine
 * CORS-Header, ein direkter fetch() aus dem Browser würde also mit einem
 * (für den Entwickler ziemlich kryptischen) CORS-Fehler scheitern – nicht
 * weil der Code falsch ist, sondern weil Fitbits Server das schlicht nicht
 * unterstützt. Deshalb läuft JEDER fetch()-Call hier über den minimalen
 * CORS-Relay (cors-relay/worker.js, s. FITBIT_CONFIG.relayUrl). Der
 * OAuth-"Authorize"-Schritt (startLogin) ist davon NICHT betroffen, weil das
 * ein normaler Seiten-Redirect ist (kein fetch/XHR) – für Browser-Navigation
 * gilt CORS nicht.
 *
 * Ablauf:
 *   startLogin()             Button "Mit Fitbit verbinden" -> Redirect zu Fitbit
 *   handleRedirectCallback() beim App-Start prüfen: kommen wir gerade von
 *                            Fitbit zurück? Falls ja: Code gegen Tokens tauschen.
 *   getValidAccessToken()    vor JEDEM API-Call aufrufen. Liefert ein
 *                            garantiert (noch) gültiges Access Token,
 *                            refresht bei Bedarf automatisch im Hintergrund.
 */

import { FITBIT_CONFIG } from "../config.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";

const STORAGE_KEY_TOKENS = "vitalsync.fitbit.tokens";
// code_verifier + state müssen nur zwischen "Redirect zu Fitbit" und
// "Redirect zurück" überleben, nicht länger -> sessionStorage statt
// localStorage (wird pro Tab automatisch aufgeräumt, kein Leak über
// mehrere Logins hinweg).
const STORAGE_KEY_VERIFIER = "vitalsync.fitbit.pkce_verifier";
const STORAGE_KEY_STATE = "vitalsync.fitbit.pkce_state";

// Sicherheitsmarge: Wir erneuern das Token schon 60 Sekunden VOR dem
// tatsächlichen Ablauf, damit ein Request, der genau in dem Moment startet,
// nicht mit einem abgelaufenen Token bei Fitbit ankommt (Netzwerk-Latenz,
// Uhr-Ungenauigkeiten etc.).
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

function tokenEndpoint() {
  return `${FITBIT_CONFIG.relayUrl}/oauth2/token`;
}

function readStoredTokens() {
  const raw = localStorage.getItem(STORAGE_KEY_TOKENS);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeTokens(tokenResponse) {
  // Fitbit liefert "expires_in" als Sekunden ab JETZT. Wir rechnen das
  // sofort in einen absoluten Unix-Timestamp (ms) um, damit wir später
  // nicht mehr wissen müssen, WANN der Request gestellt wurde.
  const expiresAtMs = Date.now() + tokenResponse.expires_in * 1000;
  const record = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    scope: tokenResponse.scope,
    userId: tokenResponse.user_id,
    expiresAtMs,
  };
  localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(record));
  return record;
}

export function isConnected() {
  return readStoredTokens() !== null;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY_TOKENS);
}

/**
 * Schritt 1: Nutzer klickt "Mit Fitbit verbinden". Wir erzeugen das
 * PKCE-Paar + einen CSRF-state, merken uns beides kurzfristig und schicken
 * den Browser per echtem Redirect (window.location.href = ...) zu Fitbits
 * Zustimmungsseite. Von dort kommt der Browser mit ?code=...&state=... auf
 * genau dieser Seite (redirectUri = Startseite der App) wieder zurück.
 */
export async function startLogin() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEY_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const params = new URLSearchParams({
    client_id: FITBIT_CONFIG.clientId,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: FITBIT_CONFIG.scopes.join(" "),
    redirect_uri: FITBIT_CONFIG.redirectUri,
  });

  window.location.href = `${FITBIT_CONFIG.authorizeUrl}?${params.toString()}`;
}

/**
 * Schritt 2: beim Laden der App aufrufen (einmalig, z.B. in main.jsx).
 * Prüft, ob die aktuelle URL Fitbit-Redirect-Parameter enthält. Falls ja:
 * validiert den state (CSRF-Schutz), tauscht den Code gegen Tokens und
 * räumt danach die URL wieder auf (damit ein Reload nicht versehentlich
 * denselben – dann schon verbrauchten – Code erneut einlöst).
 *
 * Rückgabe: "connected" | "error" | "idle" (idle = kein Redirect, normaler
 * App-Start).
 */
export async function handleRedirectCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (!code && !errorParam) {
    return { status: "idle" };
  }

  // URL sofort bereinigen (History API, kein Reload), damit code/state
  // nicht im Browserverlauf oder bei einem Reload nochmal verarbeitet werden.
  window.history.replaceState({}, "", FITBIT_CONFIG.redirectUri);

  if (errorParam) {
    return { status: "error", message: `Fitbit hat den Login abgelehnt: ${errorParam}` };
  }

  const expectedState = sessionStorage.getItem(STORAGE_KEY_STATE);
  const codeVerifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_STATE);
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);

  if (!expectedState || returnedState !== expectedState) {
    return { status: "error", message: "Sicherheitsprüfung fehlgeschlagen (state stimmt nicht überein). Bitte erneut versuchen." };
  }
  if (!codeVerifier) {
    return { status: "error", message: "PKCE-Verifier nicht gefunden (Session abgelaufen?). Bitte erneut versuchen." };
  }

  try {
    // Token-Exchange: PUBLIC CLIENT ohne Secret. Statt eines
    // Authorization-Basic-Headers (den ein "Server"-App-Typ nutzen würde)
    // schicken wir client_id im Body mit UND den code_verifier im
    // Klartext – Fitbit hasht ihn serverseitig erneut und vergleicht ihn
    // mit dem code_challenge, den wir in startLogin() übermittelt haben.
    const body = new URLSearchParams({
      client_id: FITBIT_CONFIG.clientId,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: FITBIT_CONFIG.redirectUri,
    });

    const response = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { status: "error", message: `Token-Austausch fehlgeschlagen (${response.status}): ${errorText}` };
    }

    const tokenResponse = await response.json();
    storeTokens(tokenResponse);
    return { status: "connected" };
  } catch (err) {
    return { status: "error", message: `Netzwerkfehler beim Token-Austausch: ${err.message}` };
  }
}

/**
 * Tauscht ein Refresh Token gegen ein frisches Access+Refresh Token Paar.
 * Fitbit gibt bei jedem Refresh ein NEUES Refresh Token zurück (Rotation) –
 * das alte wird dabei ungültig. Deshalb überschreiben wir IMMER beide
 * Tokens komplett mit der Antwort, statt nur den access_token zu ersetzen.
 *
 * Schlägt der Refresh fehl (z.B. weil der Nutzer den Zugriff in der
 * Fitbit-App widerrufen hat, oder das Refresh Token > 8h ungenutzt abgelaufen
 * ist), löschen wir die gespeicherten Tokens vollständig – die App muss dann
 * den Nutzer erneut zu startLogin() schicken. Es gibt keinen Automatismus,
 * der das "stillschweigend" umgeht, weil ein hängender Refresh-Loop sonst
 * unbemerkt Requests gegen einen ungültigen Endpunkt feuern würde.
 */
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: FITBIT_CONFIG.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    logout();
    throw new Error(`Refresh fehlgeschlagen (${response.status}) – bitte erneut mit Fitbit verbinden.`);
  }

  const tokenResponse = await response.json();
  return storeTokens(tokenResponse);
}

/**
 * Zentrale Funktion, die JEDER API-Call zuerst aufruft. Garantiert ein
 * gültiges Access Token – entweder das bestehende (falls noch nicht bald
 * abgelaufen) oder ein frisch per Refresh geholtes.
 *
 * Ein einfacher "inFlightRefresh"-Guard verhindert, dass mehrere parallele
 * API-Calls (z.B. während des 90-Tage-Backfills, wo viele Requests
 * nacheinander/parallel laufen) gleichzeitig mehrere Refresh-Requests
 * auslösen – Fitbits Refresh-Token-Rotation würde sonst dazu führen, dass
 * der zweite parallele Refresh-Call ein bereits durch den ersten Call
 * invalidiertes Refresh Token verwendet und fehlschlägt.
 */
let inFlightRefresh = null;

export async function getValidAccessToken() {
  const stored = readStoredTokens();
  if (!stored) {
    throw new Error("Nicht mit Fitbit verbunden.");
  }

  const isExpiringSoon = Date.now() >= stored.expiresAtMs - EXPIRY_SAFETY_MARGIN_MS;
  if (!isExpiringSoon) {
    return stored.accessToken;
  }

  if (!inFlightRefresh) {
    inFlightRefresh = refreshAccessToken(stored.refreshToken).finally(() => {
      inFlightRefresh = null;
    });
  }

  const refreshed = await inFlightRefresh;
  return refreshed.accessToken;
}

export function getStoredUserId() {
  return readStoredTokens()?.userId ?? null;
}
