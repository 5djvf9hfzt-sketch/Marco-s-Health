/**
 * Google OAuth 2.0 – zwei Betriebsarten
 * =======================================
 *
 * Google verlangt für OAuth-Clients vom Typ "Webanwendung" beim Token-Tausch
 * zwingend ein Client-Secret – auch dann, wenn der Flow mit PKCE abgesichert
 * ist (nachgewiesen: die Antwort lautet
 * `{"error":"invalid_request","error_description":"client_secret is missing."}`).
 * Ein Secret darf aber niemals in den öffentlichen Browser-Code.
 *
 * Deshalb kennt dieses Modul zwei Wege. Umgeschaltet wird allein über
 * GOOGLE_CONFIG.tokenRelayUrl in config.js:
 *
 *  A) tokenRelayUrl LEER  ->  Impliziter Flow ("response_type=token")
 *     Google liefert das Access-Token direkt im URL-Fragment zurück, es gibt
 *     gar keinen Token-Tausch und damit auch kein Secret-Problem. Die App
 *     bleibt vollständig statisch, ganz ohne Serverkomponente.
 *     Preis: Das Token gilt nur eine Stunde und es gibt kein Refresh-Token.
 *     Läuft es ab, holt die App beim nächsten Start still ein neues
 *     (prompt=none) – solange die Google-Sitzung im Browser besteht, ohne
 *     jede Nutzerinteraktion.
 *
 *  B) tokenRelayUrl GESETZT  ->  Authorization Code Flow mit PKCE
 *     Der Token-Tausch läuft über den Mini-Worker aus optional-token-helper/,
 *     der das Secret serverseitig ergänzt. Dafür gibt es echte
 *     Refresh-Tokens und damit einen Login, der im Hintergrund erneuert wird.
 *
 * Beide Wege benutzen denselben state-Parameter als CSRF-Schutz und legen das
 * Ergebnis im selben Format ab, sodass der Rest der App nichts davon merkt.
 */

import { GOOGLE_CONFIG } from "../config.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";

const STORAGE_KEY_TOKENS = "vitalsync.google.tokens";
// code_verifier + state müssen nur zwischen "Redirect zu Google" und
// "Redirect zurück" überleben -> sessionStorage statt localStorage.
const STORAGE_KEY_VERIFIER = "vitalsync.google.pkce_verifier";
const STORAGE_KEY_STATE = "vitalsync.google.pkce_state";
// Merkt sich, dass in dieser Browser-Sitzung bereits eine stille Erneuerung
// versucht wurde – ohne diese Sperre könnte ein fehlgeschlagener
// prompt=none-Versuch eine Endlos-Weiterleitung auslösen.
const STORAGE_KEY_SILENT_TRIED = "vitalsync.google.silent_tried";

// Sicherheitsmarge: Wir behandeln das Token schon 60 Sekunden vor dem
// tatsächlichen Ablauf als ungültig, damit ein Request, der genau in dem
// Moment startet, nicht mit einem abgelaufenen Token bei Google ankommt.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/** true, wenn der Relay konfiguriert ist – dann läuft Weg B (Code Flow). */
function usesCodeFlow() {
  return Boolean(GOOGLE_CONFIG.tokenRelayUrl);
}

function tokenEndpoint() {
  return `${GOOGLE_CONFIG.tokenRelayUrl.replace(/\/$/, "")}/oauth/token`;
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

function storeTokens({ accessToken, expiresInSeconds, refreshToken, scope }, previous) {
  const record = {
    accessToken,
    // Beim Refresh schickt Google KEIN neues refresh_token mit – das alte
    // bleibt gültig und muss deshalb erhalten bleiben.
    refreshToken: refreshToken ?? previous?.refreshToken ?? null,
    scope,
    expiresAtMs: Date.now() + (Number(expiresInSeconds) || 3600) * 1000,
  };
  localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(record));
  return record;
}

export function isConnected() {
  // Bewusst unabhängig vom Ablaufdatum: Ist schon einmal eine Verbindung
  // zustande gekommen, soll das Dashboard mit den gespeicherten Daten
  // sichtbar bleiben, auch wenn das Token gerade erneuert werden muss.
  return readStoredTokens() !== null;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY_TOKENS);
  sessionStorage.removeItem(STORAGE_KEY_SILENT_TRIED);
}

function isExpired(stored) {
  return Date.now() >= stored.expiresAtMs - EXPIRY_SAFETY_MARGIN_MS;
}

/**
 * true, wenn das Token abgelaufen ist und nicht automatisch erneuert werden
 * kann – die Oberfläche zeigt dann einen "Neu verbinden"-Hinweis an.
 */
export function needsReconnect() {
  const stored = readStoredTokens();
  if (!stored || !isExpired(stored)) return false;
  // Im Code Flow kann ein Refresh-Token die Erneuerung übernehmen.
  if (usesCodeFlow() && stored.refreshToken) return false;
  // Im impliziten Flow ist eine stille Erneuerung nur einmal je Sitzung sinnvoll.
  return sessionStorage.getItem(STORAGE_KEY_SILENT_TRIED) === "1";
}

/** true, wenn ein stiller Erneuerungsversuch (Weg A) jetzt sinnvoll ist. */
export function shouldAttemptSilentRenewal() {
  if (usesCodeFlow()) return false;
  const stored = readStoredTokens();
  if (!stored || !isExpired(stored)) return false;
  return sessionStorage.getItem(STORAGE_KEY_SILENT_TRIED) !== "1";
}

/**
 * Startet den Login per echtem Seiten-Redirect.
 *
 * @param {object} [options]
 * @param {boolean} [options.silent] Nur Weg A: ohne Nutzerinteraktion
 *   erneuern (prompt=none). Besteht die Google-Sitzung noch, kommt der
 *   Browser sofort mit einem frischen Token zurück; sonst mit einem Fehler,
 *   den handleRedirectCallback() als "bitte neu verbinden" meldet.
 */
export async function startLogin({ silent = false } = {}) {
  const state = generateState();
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    state,
    scope: GOOGLE_CONFIG.scopes.join(" "),
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    // include_granted_scopes wird bewusst NICHT gesetzt: zuvor erteilte
    // Google-Fit-Altberechtigungen können sonst mit den neuen
    // Health-API-Scopes kollidieren.
  });

  if (usesCodeFlow()) {
    // --- Weg B: Authorization Code Flow mit PKCE -----------------------
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem(STORAGE_KEY_VERIFIER, codeVerifier);
    params.set("response_type", "code");
    params.set("code_challenge", await generateCodeChallenge(codeVerifier));
    params.set("code_challenge_method", "S256");
    // access_type=offline + prompt=consent sind die Bedingung dafür, dass
    // Google überhaupt ein Refresh-Token ausstellt.
    params.set("access_type", "offline");
    params.set("prompt", "select_account consent");
  } else {
    // --- Weg A: Impliziter Flow ---------------------------------------
    params.set("response_type", "token");
    if (silent) {
      // prompt=none zeigt keinerlei Oberfläche: Entweder Google leitet
      // sofort mit einem Token zurück, oder es kommt ein Fehler.
      params.set("prompt", "none");
      sessionStorage.setItem(STORAGE_KEY_SILENT_TRIED, "1");
    } else {
      // select_account erzwingt die Kontoauswahl. Ohne das nimmt Google
      // stillschweigend das zuletzt verwendete Konto – auf Geräten mit
      // mehreren Google-Konten führt das zu einem access_denied, dessen
      // Ursache nicht erkennbar ist.
      params.set("prompt", "select_account");
      sessionStorage.removeItem(STORAGE_KEY_SILENT_TRIED);
    }
  }

  window.location.href = `${GOOGLE_CONFIG.authorizeUrl}?${params.toString()}`;
}

/** Prüft den state-Parameter (CSRF-Schutz) und räumt ihn auf. */
function consumeState(returnedState) {
  const expected = sessionStorage.getItem(STORAGE_KEY_STATE);
  sessionStorage.removeItem(STORAGE_KEY_STATE);
  return Boolean(expected) && returnedState === expected;
}

function cleanUrl() {
  window.history.replaceState({}, "", GOOGLE_CONFIG.redirectUri);
}

/**
 * Beim Laden der App aufrufen. Erkennt die Rückkehr von Google und wertet sie
 * aus – im impliziten Flow steht das Ergebnis im URL-Fragment (#...), im Code
 * Flow in der Query (?...).
 *
 * @returns {Promise<{status: "connected"|"error"|"reauth_required"|"idle", message?: string}>}
 */
export async function handleRedirectCallback() {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");

  const accessToken = hashParams.get("access_token");
  const code = url.searchParams.get("code");
  const errorParam = hashParams.get("error") ?? url.searchParams.get("error");

  if (!accessToken && !code && !errorParam) {
    return { status: "idle" };
  }

  const returnedState = hashParams.get("state") ?? url.searchParams.get("state");
  cleanUrl();

  if (errorParam) {
    // Ein fehlgeschlagener stiller Versuch ist kein echter Fehler: Die
    // Google-Sitzung ist nur abgelaufen, der Nutzer muss einmal tippen.
    const wasSilent = sessionStorage.getItem(STORAGE_KEY_SILENT_TRIED) === "1";
    if (wasSilent && ["login_required", "consent_required", "interaction_required"].includes(errorParam)) {
      return { status: "reauth_required" };
    }
    return { status: "error", message: `Google hat den Login abgelehnt: ${errorParam}` };
  }

  if (!consumeState(returnedState)) {
    return {
      status: "error",
      message: "Sicherheitsprüfung fehlgeschlagen (state stimmt nicht überein). Bitte erneut versuchen.",
    };
  }

  // --- Weg A: Token kam direkt im Fragment ---
  if (accessToken) {
    storeTokens(
      {
        accessToken,
        expiresInSeconds: hashParams.get("expires_in"),
        scope: hashParams.get("scope"),
      },
      null
    );
    sessionStorage.removeItem(STORAGE_KEY_SILENT_TRIED);
    return { status: "connected" };
  }

  // --- Weg B: Code gegen Tokens tauschen (über den Relay) ---
  const codeVerifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
  if (!codeVerifier) {
    return { status: "error", message: "PKCE-Verifier nicht gefunden (Session abgelaufen?). Bitte erneut versuchen." };
  }

  try {
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

    const json = await response.json();
    storeTokens(
      {
        accessToken: json.access_token,
        expiresInSeconds: json.expires_in,
        refreshToken: json.refresh_token,
        scope: json.scope,
      },
      null
    );
    return { status: "connected" };
  } catch (err) {
    return { status: "error", message: `Netzwerkfehler beim Token-Austausch: ${err.message}` };
  }
}

/**
 * Nur Weg B: Tauscht das Refresh-Token gegen ein frisches Access-Token.
 * Google rotiert Refresh-Tokens nicht – das bestehende bleibt gültig.
 */
async function refreshAccessToken(stored) {
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

  const json = await response.json();
  return storeTokens(
    { accessToken: json.access_token, expiresInSeconds: json.expires_in, scope: json.scope },
    stored
  );
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

  if (!isExpired(stored)) {
    return stored.accessToken;
  }

  // Weg A kann nicht per fetch erneuern – dafür braucht es einen Redirect,
  // den die App beim nächsten Start anstößt (shouldAttemptSilentRenewal).
  if (!usesCodeFlow() || !stored.refreshToken) {
    throw new Error("Sitzung abgelaufen – bitte erneut mit Google verbinden.");
  }

  if (!inFlightRefresh) {
    inFlightRefresh = refreshAccessToken(stored).finally(() => {
      inFlightRefresh = null;
    });
  }

  const refreshed = await inFlightRefresh;
  return refreshed.accessToken;
}
