/**
 * VitalSync – minimaler CORS-Relay für die Fitbit Web API
 * =========================================================
 *
 * WARUM DAS HIER EXISTIERT:
 * Fitbits API (sowohl der OAuth-Token-Endpunkt /oauth2/token als auch alle
 * Daten-Endpunkte unter api.fitbit.com) sendet KEINE CORS-Header. Browser
 * blockieren deshalb `fetch()`-Antworten von einer reinen statischen Seite
 * (GitHub Pages) an Fitbit – das ist keine Fehlkonfiguration, sondern eine
 * serverseitige Einschränkung von Fitbit, die clientseitig nicht lösbar ist.
 *
 * Dieses Skript ist die einzige "Backend"-Komponente von VitalSync – und
 * bewusst so dumm wie möglich gehalten:
 *   - Kein State, keine Datenbank, kein Cron-Job.
 *   - Es leitet Requests 1:1 an Fitbit weiter und hängt nur die fehlenden
 *     CORS-Response-Header an.
 *   - Es sieht zwar das Access-Token im Authorization-Header durch, SPEICHERT
 *     es aber nirgendwo – der Worker ist zustandslos, jede Anfrage wird
 *     unabhängig weitergeleitet.
 *
 * DEPLOYMENT: siehe README.md, Abschnitt (b.1) "CORS-Relay deployen".
 * Läuft kostenlos auf Cloudflare Workers (Free-Tier: 100.000 Requests/Tag).
 */

// Trage hier die Origin(s) ein, von denen aus Requests erlaubt sein sollen.
// Beispiel: "https://deinname.github.io"
// Für lokale Entwicklung ist http://localhost:5173 (Vite-Devserver) enthalten.
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  // "https://deinname.github.io", // <-- nach dem Deploy auf GitHub Pages hier ergänzen
];

const FITBIT_API_ORIGIN = "https://api.fitbit.com";

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    // Same-Origin-Check: nur bekannte Origins dürfen den Relay benutzen,
    // damit der Worker nicht zu einem offenen Fitbit-Proxy für Fremde wird.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Origin nicht erlaubt", { status: 403, headers });
    }

    // Preflight-Request des Browsers: sofort beantworten, NICHT an Fitbit
    // weiterleiten (Fitbit kennt OPTIONS nicht und würde einen Fehler werfen).
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const incomingUrl = new URL(request.url);
    // Alles nach der Worker-Domain wird 1:1 an api.fitbit.com weitergereicht,
    // z.B. /oauth2/token -> https://api.fitbit.com/oauth2/token
    //      /1/user/-/profile.json -> https://api.fitbit.com/1/user/-/profile.json
    const targetUrl = FITBIT_API_ORIGIN + incomingUrl.pathname + incomingUrl.search;

    const forwardedHeaders = new Headers();
    const contentType = request.headers.get("Content-Type");
    const authorization = request.headers.get("Authorization");
    if (contentType) forwardedHeaders.set("Content-Type", contentType);
    if (authorization) forwardedHeaders.set("Authorization", authorization);

    const fitbitResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardedHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });

    const responseHeaders = new Headers(fitbitResponse.headers);
    Object.entries(headers).forEach(([key, value]) => responseHeaders.set(key, value));

    return new Response(fitbitResponse.body, {
      status: fitbitResponse.status,
      statusText: fitbitResponse.statusText,
      headers: responseHeaders,
    });
  },
};
