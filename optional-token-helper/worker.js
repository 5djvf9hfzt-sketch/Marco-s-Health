/**
 * VitalSync – OPTIONALER Token-Helfer
 * =====================================
 *
 * IM NORMALFALL BRAUCHST DU DIESE DATEI NICHT.
 *
 * VitalSync läuft vollständig ohne Server: Google setzt sowohl auf dem
 * OAuth-Token-Endpunkt (oauth2.googleapis.com) als auch auf der Health API
 * (health.googleapis.com) CORS-Header, der Browser darf also beide direkt
 * ansprechen. Der PKCE-Flow ist genau dafür gemacht, ohne Client-Secret
 * auszukommen.
 *
 * WANN DU IHN DOCH BRAUCHST:
 * Sollte Google den Token-Tausch für deinen OAuth-Client mit einer Meldung wie
 * "client_secret is missing" ablehnen, brauchst du eine Stelle, an der das
 * Secret liegen kann, ohne im öffentlichen Browser-Code zu landen. Genau das
 * ist dieses Skript: ein zustandsloser Mini-Helfer für Cloudflare Workers.
 *
 * Er ergänzt bei Token-Anfragen ausschließlich das Client-Secret und reicht
 * die Antwort durch. Kein Speicher, keine Datenbank, kein Cron-Job. Deine
 * Gesundheitsdaten laufen NICHT hierüber – die holt die App weiterhin direkt
 * bei Google.
 *
 * EINRICHTUNG (nur im Bedarfsfall):
 *  1. Worker anlegen, diesen Code einfügen, ALLOWED_ORIGINS unten anpassen.
 *  2. Im Worker unter "Settings -> Variables" eine verschlüsselte Variable
 *     (Secret) namens GOOGLE_CLIENT_SECRET mit dem Wert aus der Google Cloud
 *     Console anlegen.
 *  3. Die Worker-URL in src/config.js als `tokenRelayUrl` eintragen.
 */

// Origin(s), von denen aus Anfragen erlaubt sind – ohne Pfad, ohne
// abschließenden Schrägstrich. Beispiel: "https://deinname.github.io"
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  // "https://deinname.github.io", // <-- deine GitHub-Pages-Origin ergänzen
];

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    // Nur bekannte Origins dürfen den Helfer benutzen, damit er nicht zum
    // offenen Token-Endpunkt für Fremde wird.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Origin nicht erlaubt", { status: 403, headers });
    }

    // Preflight des Browsers sofort beantworten.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/oauth/token") {
      return new Response("Nicht gefunden. Dieser Worker beantwortet nur POST /oauth/token.", {
        status: 404,
        headers,
      });
    }

    // Die vom Browser geschickten OAuth-Parameter übernehmen und nur das
    // Secret ergänzen. Der Browser sendet weiterhin PKCE-code_verifier bzw.
    // refresh_token – daran ändert der Helfer nichts.
    const incoming = new URLSearchParams(await request.text());
    if (env.GOOGLE_CLIENT_SECRET) {
      incoming.set("client_secret", env.GOOGLE_CLIENT_SECRET);
    }

    const googleResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: incoming.toString(),
    });

    const responseHeaders = new Headers(headers);
    responseHeaders.set("Content-Type", googleResponse.headers.get("Content-Type") ?? "application/json");

    return new Response(googleResponse.body, {
      status: googleResponse.status,
      headers: responseHeaders,
    });
  },
};
