# VitalSync

Ein rein statisches Gesundheits-Dashboard (PWA): Whoop-artige **Recovery-,
Strain- und Sleep-Scores** kombiniert mit einem Bevel-Health-artigen
**biologischen Alter** – berechnet direkt im Browser aus deinen Fitbit-Daten.

- **Kein Backend, keine Datenbank, kein Server-Cron-Job.** Die einzige
  Server-Komponente ist ein winziger, zustandsloser CORS-Relay (siehe unten,
  Punkt "Warum ein Relay nötig ist") – er speichert nichts, führt keine Logik
  aus, sondern leitet Requests 1:1 weiter.
- Alle deine Gesundheitsdaten bleiben ausschließlich in deinem Browser
  (IndexedDB/localStorage).
- Läuft als PWA auf dem iPhone-Homescreen, offline-fähig für bereits
  geladene Daten.

---

## ⚠️ Wichtiger Hinweis vorab: Warum ein CORS-Relay nötig ist

Fitbits Web API sendet **keine CORS-Header** – weder der OAuth-Token-Endpunkt
noch die Daten-Endpunkte. Ein Browser blockiert deshalb `fetch()`-Antworten
von einer rein statischen Seite (wie GitHub Pages) an Fitbit. Das ist keine
Fehlkonfiguration in diesem Projekt, sondern eine serverseitige Einschränkung
von Fitbit, die clientseitig nicht lösbar ist.

Die Lösung: ein **einziges, ca. 60 Zeilen kleines, zustandsloses Skript**
(`cors-relay/worker.js`), das du kostenlos auf Cloudflare Workers deployst.
Es speichert nichts, hat keine Datenbank, keinen Cron-Job – es hängt bei
jedem Request nur die fehlenden CORS-Header an und leitet 1:1 an
`api.fitbit.com` weiter. Alle deine Daten (Tokens, Gesundheitswerte) fließen
NUR durch, werden nirgendwo gespeichert.

## ⚠️ Wichtiger Hinweis: Fitbit Web API Sunset am 30. September 2026

Fitbit/Google schalten die klassische Fitbit Web API zum **30. September
2026** zugunsten der neuen Google Health API ab. Bestehende OAuth-Verbindungen
migrieren nicht automatisch – Nutzer müssen sich nach der Umstellung über die
neue API erneut verbinden. VitalSync ist aktuell gegen die klassische Fitbit
Web API gebaut (passend zu den in der Aufgabenstellung geforderten Scopes).
Nach der Abschaltung müssten `src/api/fitbitApi.js`, `src/auth/fitbitAuth.js`
und `cors-relay/worker.js` auf die Google Health API (`health.googleapis.com`)
umgestellt werden – die restliche App (Speicherschicht, Bio-Age-Modul,
Scores, UI) bleibt davon unberührt, da sie nur mit bereits normalisierten
Tagesdaten arbeitet.

---

## Was das Dashboard zeigt

**Home**
- Biologisches Alter als zentrale Kennzahl inkl. Abweichung zum chronologischen
  Alter, Konfidenz-Indikator und Faktor-Aufschlüsselung (nach Kategorie oder
  als Detailliste aller 15 Einzelfaktoren)
- Tagesscores als Ringe: Recovery (0–100), Sleep Score (0–100), Strain (0–21)
- Vitalwerte-Kacheln mit Mini-Verlauf und Abweichung zur 30-Tage-Baseline:
  HRV, Ruhepuls, SpO₂, Atemfrequenz, VO₂max, Schritte
- Schlaf der letzten Nacht: Dauer, Effizienz, Phasenverteilung (Tief/REM/
  Leicht/Wach), Zeit im Bett, Einschlafzeit, Schlafdefizit der letzten 7 Tage
- Aktivität: Zonenminuten der Woche gegen die WHO-Empfehlung, Kalorien

**Trends** – Flächendiagramme mit 7/30/90-Tage-Umschaltung für Recovery,
Sleep Score, Strain, HRV, Ruhepuls, VO₂max, Schlafdauer, Schlafeffizienz,
Schritte, Zonenminuten, Kalorien, SpO₂ und Atemfrequenz – jeweils mit Ø/Min/Max
und Angabe, an wie vielen Tagen des Zeitraums überhaupt Daten vorlagen.

**Lifestyle** – Profil (Alter, Geschlecht, Gewicht, Größe inkl. berechnetem BMI)
und Fragebogen (Rauchen, Alkohol, Ernährung, Stress), beides jederzeit
editierbar, mit Änderungsverlauf.

**Insights** – automatisch erzeugte Hinweise bei Abweichungen von der Baseline,
zu Schlafdefizit, Schlafrhythmus, Wochenaktivität und dem größten Einzelhebel
im biologischen Alter.

---

## Architektur-Überblick

```
Browser (GitHub Pages, statisch)
  │
  │  fetch() über den CORS-Relay
  ▼
Cloudflare Worker (cors-relay/worker.js)   ← einzige "Server"-Komponente, zustandslos
  │
  ▼
Fitbit Web API (api.fitbit.com)
```

- `src/auth/` – PKCE-OAuth-Flow + Token-Refresh (ausführlich kommentiert)
- `src/api/` – Fitbit-API-Client + Sync-Orchestrierung (90-Tage-Backfill, danach inkrementell)
- `src/storage/db.js` – IndexedDB-Speicherschicht
- `src/models/biologicalAge.js` – **alle Gewichtungen/Schwellenwerte für das biologische Alter, zentral an einer Stelle**
- `src/models/scores.js`, `baseline.js` – Recovery/Strain/Sleep-Scores relativ zur persönlichen Baseline
- `src/screens/`, `src/components/` – UI (Onboarding, Home, Trends, Lifestyle, Insights)
- `public/manifest.webmanifest`, `public/sw.js` – PWA/Offline-Fähigkeit

---

## (a) Fitbit Developer Account anlegen und App registrieren

1. Gehe auf **https://dev.fitbit.com** und logge dich mit deinem normalen
   Fitbit-Account ein (oder erstelle einen, falls du noch keinen hast).
2. Klicke oben rechts auf deinen Namen → **"Manage" → "Register An App"**
   (oder direkt dev.fitbit.com/apps/new).
3. Fülle das Formular aus:
   - **Application Name**: z.B. "VitalSync"
   - **Description**: kurz, z.B. "Persönliches Gesundheits-Dashboard"
   - **Application Website**: deine spätere GitHub-Pages-URL (kannst du
     vorerst auch `https://github.com/DEIN-NAME/DEIN-REPO` eintragen)
   - **Organization** / **Organization Website**: kannst du mit deinem Namen
     bzw. derselben URL ausfüllen
   - **Terms of Service URL** / **Privacy Policy URL**: da dies eine rein
     private App ist, kannst du hier ebenfalls deine GitHub-Repo-URL eintragen
   - **OAuth 2.0 Application Type**: **"Client"** (NICHT "Server"! Nur
     "Client"-Apps unterstützen PKCE ohne Client-Secret)
   - **Redirect URL**: Das ist die wichtigste Einstellung. Sie muss **exakt**
     der URL entsprechen, unter der deine App später läuft, z.B.:
     `https://DEIN-GITHUB-NAME.github.io/DEIN-REPO-NAME/`
     (mit abschließendem Schrägstrich!). Du kannst das Feld nach dem
     GitHub-Pages-Setup (Schritt b) jederzeit in den App-Einstellungen
     nachträglich anpassen.
   - **Default Access Type**: "Read-Only" reicht aus.
4. Nach dem Speichern siehst du deine **OAuth 2.0 Client ID** (KEIN
   Client-Secret nötig – das ist bei "Client"-Apps mit PKCE so vorgesehen).
   Trage diese ID später in `src/config.js` (`FITBIT_CONFIG.clientId`) ein.

Benötigte Scopes (bereits fest in `src/config.js` hinterlegt, keine
Änderung nötig): `heartrate`, `sleep`, `activity`, `profile`,
`oxygen_saturation`, `respiratory_rate`, `cardio_fitness`.

---

## (b) GitHub Account, Repo, Code hochladen, GitHub Pages aktivieren

### (b.1) CORS-Relay auf Cloudflare Workers deployen

1. Erstelle kostenlos einen Account auf **https://dash.cloudflare.com/sign-up**.
2. Im Dashboard: **Workers & Pages → Create → Create Worker**.
3. Vergib einen Namen (z.B. `vitalsync-proxy`) und klicke **Deploy**
   (zunächst mit dem Standard-"Hello World"-Code – das ändern wir gleich).
4. Klicke danach auf **"Edit Code"** (Quick Edit) und ersetze den kompletten
   Inhalt durch den Code aus `cors-relay/worker.js` in diesem Repository.
5. Trage in der `ALLOWED_ORIGINS`-Liste im Worker-Code deine spätere
   GitHub-Pages-URL ein, z.B. `"https://DEIN-GITHUB-NAME.github.io"`
   (**ohne** Pfad/Repo-Namen, **ohne** abschließenden Schrägstrich – das ist
   die "Origin", nicht die volle URL).
6. Klicke **Deploy**. Die angezeigte URL (z.B.
   `https://vitalsync-proxy.DEIN-NAME.workers.dev`) ist dein Relay-Endpunkt –
   trage sie in `src/config.js` unter `FITBIT_CONFIG.relayUrl` ein.

### (b.2) Repo erstellen und Code hochladen

1. Erstelle einen kostenlosen Account auf **https://github.com/signup**,
   falls noch nicht vorhanden.
2. Klicke oben rechts auf **"+" → "New repository"**. Name frei wählbar
   (z.B. `vitalsync`), Sichtbarkeit "Public" (nötig für kostenloses GitHub
   Pages), **ohne** README/​.gitignore initialisieren (dieses Repo bringt
   bereits alles mit).
3. Trage in `src/config.js` deine **Fitbit Client ID** (aus Schritt a) und
   deine **Relay-URL** (aus Schritt b.1) ein.
4. Lade den kompletten Projektordner in dein neues Repository hoch, z.B.
   lokal per Git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/DEIN-GITHUB-NAME/DEIN-REPO-NAME.git
   git push -u origin main
   ```
   (Alternativ: Dateien direkt über die GitHub-Weboberfläche hochladen.)

### (b.3) GitHub Pages aktivieren

1. Im Repository: **Settings → Pages**.
2. Unter "Build and deployment" → **Source: "GitHub Actions"** auswählen
   (NICHT "Deploy from a branch" – dieses Projekt bringt bereits einen
   fertigen Workflow unter `.github/workflows/deploy.yml` mit, der bei jedem
   Push automatisch baut und deployt).
3. Der Workflow startet bei jedem Push auf einen beliebigen Branch und lässt
   sich zusätzlich manuell starten: Tab **"Actions"** → links den Workflow
   "Deploy VitalSync to GitHub Pages" wählen → Button **"Run workflow"**.
   Nach ein bis zwei Minuten ist deine App erreichbar unter
   `https://DEIN-GITHUB-NAME.github.io/DEIN-REPO-NAME/`.
4. **Jetzt die Fitbit-App-Einstellungen (Schritt a) aktualisieren:** trage
   diese exakte URL (mit abschließendem `/`) als **Redirect URL** in deiner
   Fitbit-App-Konfiguration auf dev.fitbit.com ein.

---

## (c) VitalSync auf dem iPhone installieren

1. Öffne die GitHub-Pages-URL deiner App in **Safari** auf dem iPhone
   (wichtig: Safari, nicht Chrome – nur Safari unterstützt "Zum
   Home-Bildschirm hinzufügen" mit vollem PWA-Support auf iOS).
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben) in der
   unteren Menüleiste.
3. Wähle **"Zum Home-Bildschirm"**.
4. Vergib einen Namen (Vorschlag: "VitalSync") und tippe auf **"Hinzufügen"**.
5. Öffne VitalSync ab jetzt über das neue Icon auf dem Home-Bildschirm – die
   App startet dann im Vollbildmodus (ohne Safari-Adressleiste) und bleibt
   auch offline nutzbar (mit den zuletzt synchronisierten Daten).
6. Beim ersten Öffnen: "Mit Fitbit verbinden" antippen, im folgenden
   Fitbit-Login-Dialog zustimmen, Profil + Lifestyle-Fragebogen ausfüllen.
   Der initiale 90-Tage-Datenabruf läuft im Hintergrund (kleiner
   Fortschrittshinweis auf dem letzten Onboarding-Schritt).

---

## Lokal entwickeln / testen

```bash
npm install
npm run dev       # Entwicklungsserver, http://localhost:5173
npm run build     # Produktions-Build nach dist/
npm run preview   # Baut nicht neu, dient nur zum lokalen Testen von dist/
```

Für lokale Entwicklung ist `http://localhost:5173` bereits in
`cors-relay/worker.js` (`ALLOWED_ORIGINS`) hinterlegt und muss beim
Cloudflare-Worker-Deploy nicht entfernt werden.

## Troubleshooting

- **"Origin nicht erlaubt" / CORS-Fehler im Browser**: Prüfe, ob deine
  GitHub-Pages-Origin exakt (inkl. `https://`, ohne Pfad) in
  `ALLOWED_ORIGINS` im deployten Worker-Code steht, und dass du den Worker
  nach einer Änderung erneut deployt hast.
- **Fitbit zeigt "Invalid redirect_uri"**: Die Redirect-URL in den
  Fitbit-App-Einstellungen muss exakt (inkl. abschließendem `/`) der
  tatsächlichen GitHub-Pages-URL entsprechen.
- **Token-Refresh schlägt dauerhaft fehl**: Der Nutzer hat den Zugriff
  vermutlich in seinem Fitbit-Account widerrufen – einfach über "Mit Fitbit
  verbinden" erneut anmelden.
- **Manche Kacheln zeigen "Keine Daten"**: Manche Fitbit-Geräte liefern
  bestimmte Metriken nicht (z.B. Cardio Fitness Score, SpO2). Das betrifft
  dann gezielt nur diesen einen Faktor, nicht die restliche App.

## Wichtiger Hinweis

VitalSync liefert Schätzwerte zur Selbstreflexion auf Basis vereinfachter,
nicht klinisch validierter Berechnungen (siehe Kommentare in
`src/models/biologicalAge.js`) – keine Diagnose, keine medizinische
Beratung.
