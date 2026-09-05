/**
 * PKCE-Hilfsfunktionen (Proof Key for Code Exchange, RFC 7636)
 * =============================================================
 *
 * PKCE existiert, damit "public clients" – also Apps, die KEIN Client-Secret
 * sicher aufbewahren können (SPAs, Mobile-Apps) – trotzdem sicher OAuth 2.0
 * Authorization Code Flow nutzen können. Ohne PKCE könnte jemand, der den
 * Authorization Code abfängt (z.B. über die Browser-History oder einen
 * bösartigen Redirect), diesen gegen ein Access Token eintauschen.
 *
 * Der Trick: Wir erzeugen VOR dem Redirect zu Fitbit ein zufälliges Geheimnis
 * ("code_verifier"), das nur in diesem Browser existiert. Wir schicken Fitbit
 * nur einen Hash davon ("code_challenge"). Fitbit merkt sich den Hash. Wenn
 * wir später den Authorization Code gegen Tokens eintauschen, müssen wir den
 * ORIGINAL code_verifier mitschicken – Fitbit prüft, ob dessen Hash zum
 * vorher übermittelten code_challenge passt. Ein Angreifer, der nur den Code
 * abfängt, kennt den code_verifier nicht und kann ihn nicht eintauschen.
 *
 * Ablauf im Überblick:
 *   1. generateCodeVerifier()  -> zufälliger String, bleibt lokal (sessionStorage)
 *   2. generateCodeChallenge() -> SHA-256(verifier), base64url-kodiert, geht an Fitbit
 *   3. Redirect zu Fitbit mit code_challenge + code_challenge_method=S256
 *   4. Fitbit redirected zurück mit ?code=...
 *   5. Token-Exchange: POST /oauth2/token mit code + code_verifier (Klartext)
 */

// Erzeugt kryptographisch sichere Zufallsbytes und kodiert sie als
// "base64url" (RFC 4648 §5) – also normales Base64, aber "+" -> "-",
// "/" -> "_" und ohne "=" Padding, weil das in URLs/Query-Params sonst
// escaped werden müsste.
function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Erzeugt den code_verifier: einen zufälligen String zwischen 43 und 128
 * Zeichen (RFC-7636-Vorgabe). Wir nutzen 32 zufällige Bytes -> 43 Zeichen
 * nach base64url-Kodierung, das ist das erlaubte Minimum und mehr als genug
 * Entropie (256 Bit).
 */
export function generateCodeVerifier() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(randomBytes);
}

/**
 * Erzeugt aus dem code_verifier den code_challenge per SHA-256 + base64url,
 * wie von "code_challenge_method=S256" gefordert. SubtleCrypto.digest ist
 * asynchron, deshalb ist diese Funktion async.
 */
export async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hashBuffer));
}

/**
 * Zufälliger "state"-Wert gegen CSRF: wir prüfen nach dem Redirect, ob der
 * state-Parameter, den Fitbit zurückschickt, exakt dem entspricht, den wir
 * vor dem Redirect selbst erzeugt und lokal gespeichert haben. Falls ein
 * Angreifer versucht, uns einen fremden Authorization Code unterzuschieben
 * (indem er uns einen präparierten Redirect-Link schickt), würde der
 * state-Wert nicht übereinstimmen und wir brechen ab.
 */
export function generateState() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(randomBytes);
}
