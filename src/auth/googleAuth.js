/**
 * Google OAuth 2.0 – Authorization Code Flow with PKCE
 * ======================================================
 *
 * Kompletter clientseitiger Login-Flow gegen Google, ohne Backend.
 *
 * WARUM DAS HIER OHNE SERVER FUNKTIONIERT:
 * Anders als die alte Fitbit Web API setzt Google auf beiden benötigten
 * Endpunkten CORS-Header (nachgemessen: sowohl
 * https://oauth2.googleapis.com/token als auch https://health.googleapis.com
 * geben die anfragende Origin frei). Ein Browser darf diese Aufrufe daher
 * direkt stellen – es braucht keinen Proxy und keinen Server.
 *
 * PKCE (siehe pkce.js) sichert den Flow ab, ohne dass ein Client-Secret im
 * Browser liegen muss.
 *
 * Ablauf:
 *   startLogin()             Button "Mit Google verbinden" -> Redirect zu Google
 *   handleRedirectCallback() beim App-Start prüfen: kommen wir gerade von
 *                            Google zurück? Falls ja: Code gegen Tokens tauschen.
 *   getValidAccessToken()    vor JEDEM API-Call aufrufen. Liefert ein
 *                            garantiert (noch) gültiges Access Token und
 *                            erneuert es bei Bedarf automatisch.
 */

import { GOOGLE_CONFIG } from "../config.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";

const STORAGE_KEY_TOKENS = "vitalsync.google.tokens";
// code_verifier + state müssen nur zwischen "Redirect zu Google" und
// "Redirect zurück" überleben -> sessionStorage statt localStorage.
const STORAGE_KEY_VERIFIER = "vitalsync.google.pkce_verifier";
const STORAGE_KEY_STATE = "vitalsync.google.pkce_state";

// Sicherheitsmarge: Wir erneuern das Token schon 60 Sekunden VOR dem
// tatsächlichen Ablauf, damit ein Request, der genau in dem Moment startet,
// nicht mit einem abgelaufenen Token bei Google ankommt.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Google-Access-Tokens laufen nach einer Stunde ab. Für die Erneuerung im
 * Hintergrund braucht es ein Refresh-Token, das Google nur ausstellt, wenn
 * beim Login access_type=offline und prompt=consent gesetzt sind (siehe
 * startLogin). Bekommen wir keines, bleibt die Verbindung trotzdem eine
 * Stunde nutzbar – danach meldet die App ehrlich "bitte neu verbinden",
 * statt still zu scheitern.
 */
function tokenEndpoint() {
  // Nur falls Google für den konkreten Client zwingend ein Secret verlangt,
  // kann der Token-Tausch über den optionalen Worker laufen, der das Secret
  // serverseitig ergänzt (siehe config.js -> tokenRelayUrl).
  return GOOGLE_CONFIG.tokenRelayUrl
    ? `${GOOGLE_CONFIG.tokenRelayUrl.replace(/\/$/, "")}/oauth/token`
    : GOOGLE_CONFIG.tokenUrl;
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

function storeTokens(tokenResponse, previous) {
  // Google liefert "expires_in" als Sekunden ab JETZT. Wir rechnen das sofort
  // in einen absoluten Zeitstempel um.
  const expiresAtMs = Date.now() + (tokenResponse.expires_in ?? 3600) * 1000;
  const record = {
    accessToken: tokenResponse.access_token,
    // Beim Refresh schickt Google KEIN neues refresh_token mit – das alte
    // bleibt gültig und muss deshalb erhalten bleiben.
    refreshToken: tokenResponse.refresh_token ?? previous?.refreshToken ?? null,
    scope: tokenResponse.scope,
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

/** True, wenn das Token abgelaufen ist und mangels Refresh-Token nicht erneuert werden kann. */
export function needsReconnect() {
  const stored = readStoredTokens();
  if (!stored) return false;
  return !stored.refreshToken && Date.now() >= stored.expiresAtMs;
}

/**
 * Schritt 1: Nutzer klickt "Mit Google verbinden". Wir erzeugen das
 * PKCE-Paar + einen CSRF-state, merken uns beides kurzfristig und schicken
 * den Browser per echtem Redirect zu Googles Zustimmungsseite.
 */
export async function startLogin() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEY_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: GOOGLE_CONFIG.scopes.join(" "),
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    // access_type=offline + prompt=consent sind die Bedingung dafür, dass
    // Google überhaupt ein Refresh-Token ausstellt. Ohne sie müsste sich der
    // Nutzer stündlich neu anmelden.
    access_type: "offline",
    // select_account erzwingt zusätzlich die Kontoauswahl. Ohne das nimmt
    // Google stillschweigend das im Browser zuletzt verwendete Konto – auf
    // Geräten mit mehreren Google-Konten führt das zu einem "access_denied",
    // dessen Ursache (falsches Konto) nicht erkennbar ist.
    prompt: "select_account consent",
  });

  // include_granted_scopes wird bewusst NICHT gesetzt: zuvor erteilte
  // Google-Fit-Altberechtigungen können sonst mit den neuen
  // Health-API-Scopes kollidieren.

  window.location.href = `${GOOGLE_CONFIG.authorizeUrl}?${params.toString()}`;
}

/**
 * Schritt 2: beim Laden der App aufrufen. Prüft, ob die aktuelle URL
 * Google-Redirect-Parameter enthält. Falls ja: validiert den state
 * (CSRF-Schutz), tauscht den Code gegen Tokens und räumt danach die URL
 * wieder auf (damit ein Reload nicht denselben, dann verbrauchten Code
 * erneut einlöst).
 *
 * Rückgabe: { status: "connected" | "error" | "idle", message? }
 */
export async function handleRedirectCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (!code && !errorParam) {
    return { status: "idle" };
  }

  window.history.replaceState({}, "", GOOGLE_CONFIG.redirectUri);

  if (errorParam) {
    return { status: "error", message: `Google hat den Login abgelehnt: ${errorParam}` };
  }

  const expectedState = sessionStorage.getItem(STORAGE_KEY_STATE);
  const codeVerifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_STATE);
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);

  if (!expectedState || returnedState !== expectedState) {
    return {
      status: "error",
      message: "Sicherheitsprüfung fehlgeschlagen (state stimmt nicht überein). Bitte erneut versuchen.",
    };
  }
  if (!codeVerifier) {
    return { status: "error", message: "PKCE-Verifier nicht gefunden (Session abgelaufen?). Bitte erneut versuchen." };
  }

  try {
    // Token-Exchange als PUBLIC CLIENT: kein Secret, dafür der code_verifier
    // im Klartext. Google hasht ihn serverseitig erneut und vergleicht ihn
    // mit der code_challenge aus startLogin().
    const body = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
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
    storeTokens(tokenResponse, null);
    return { status: "connected" };
  } catch (err) {
    return { status: "error", message: `Netzwerkfehler beim Token-Austausch: ${err.message}` };
  }
}

/**
 * Tauscht das Refresh-Token gegen ein frisches Access-Token.
 *
 * Google rotiert Refresh-Tokens NICHT: Die Antwort enthält nur ein neues
 * access_token, das bestehende refresh_token bleibt gültig und wird von
 * storeTokens() weitergetragen.
 *
 * Schlägt der Refresh fehl (Zugriff in den Google-Kontoeinstellungen
 * widerrufen, Token nach längerer Inaktivität verfallen), löschen wir die
 * gespeicherten Tokens – die App schickt den Nutzer dann sichtbar durch
 * startLogin(), statt endlos gegen einen toten Endpunkt zu laufen.
 */
async function refreshAccessToken(stored) {
  if (!stored.refreshToken) {
    logout();
    throw new Error("Sitzung abgelaufen – bitte erneut mit Google verbinden.");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
  });

  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    logout();
    throw new Error(`Token-Erneuerung fehlgeschlagen (${response.status}) – bitte erneut mit Google verbinden.`);
  }

  const tokenResponse = await response.json();
  return storeTokens(tokenResponse, stored);
}

/**
 * Zentrale Funktion, die JEDER API-Call zuerst aufruft.
 *
 * Der "inFlightRefresh"-Guard verhindert, dass mehrere parallele API-Calls
 * gleichzeitig je einen eigenen Refresh auslösen.
 */
let inFlightRefresh = null;

export async function getValidAccessToken() {
  const stored = readStoredTokens();
  if (!stored) {
    throw new Error("Nicht mit Google verbunden.");
  }

  const isExpiringSoon = Date.now() >= stored.expiresAtMs - EXPIRY_SAFETY_MARGIN_MS;
  if (!isExpiringSoon) {
    return stored.accessToken;
  }

  if (!inFlightRefresh) {
    inFlightRefresh = refreshAccessToken(stored).finally(() => {
      inFlightRefresh = null;
    });
  }

  const refreshed = await inFlightRefresh;
  return refreshed.accessToken;
}
