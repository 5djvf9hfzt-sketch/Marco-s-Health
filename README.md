# VitalSync

Ein rein statisches Gesundheits-Dashboard (PWA): Whoop-artige **Recovery-,
Strain- und Sleep-Scores** kombiniert mit einem Bevel-Health-artigen
**biologischen Alter** – berechnet direkt im Browser aus deinen
Google-Health-Daten (und damit aus deiner Fitbit-Uhr).

- **Kein Backend, keine Datenbank, kein Server, kein Cron-Job.** Die App ist
  eine einzelne statische Seite. Google setzt sowohl beim OAuth-Login als auch
  auf der Health API die nötigen CORS-Header, deshalb spricht der Browser beide
  direkt an.
- Alle deine Gesundheitsdaten bleiben ausschließlich in deinem Browser
  (IndexedDB/localStorage) – sie werden nirgendwohin übertragen.
- Läuft als PWA auf dem iPhone-Homescreen, offline-fähig für bereits
  geladene Daten.

---

## Warum Google und nicht Fitbit?

Die klassische **Fitbit Web API wird zum 30. September 2026 abgeschaltet** und
durch die **Google Health API** (`health.googleapis.com/v4`) ersetzt. Deine
Fitbit-Uhr liefert weiterhin Daten – sie fließen nach der Umstellung deines
Fitbit-Kontos auf ein Google-Konto in die Google Health API. VitalSync setzt
deshalb direkt auf der neuen API auf.

Angenehmer Nebeneffekt: Fitbit unterstützte kein CORS und hätte zwingend einen
Proxy-Server gebraucht. Google unterstützt CORS – die App kommt komplett ohne
Serverkomponente aus.

**Voraussetzung:** Dein Fitbit-Konto muss auf ein Google-Konto umgestellt sein,
sonst liegen in der Google Health API keine Daten deiner Uhr.

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
  ├─── OAuth-Login ──────────► accounts.google.com  (Seiten-Redirect)
  ├─── Token-Tausch ─────────► oauth2.googleapis.com  (fetch, CORS erlaubt)
  └─── Gesundheitsdaten ─────► health.googleapis.com/v4  (fetch, CORS erlaubt)

Kein eigener Server, keine Datenbank, kein Cron-Job.
```

- `src/auth/` – PKCE-OAuth-Flow gegen Google + automatischer Token-Refresh
  (ausführlich kommentiert)
- `src/api/googleHealthApi.js` – Endpunkte, Filter-Syntax und Limits der
  Google Health API v4
- `src/api/sync.js` – 90-Tage-Backfill + inkrementeller Sync; die **einzige**
  Datei, die das Antwortformat von Google kennt, und übersetzt es ins interne
  Tagesformat
- `src/storage/db.js` – IndexedDB-Speicherschicht
- `src/models/biologicalAge.js` – **alle Gewichtungen/Schwellenwerte für das
  biologische Alter, zentral an einer Stelle**
- `src/models/scores.js`, `baseline.js` – Recovery/Strain/Sleep relativ zur
  persönlichen Baseline
- `src/screens/`, `src/components/` – Oberfläche
- `optional-token-helper/` – wird im Normalfall **nicht** gebraucht (siehe
  Troubleshooting)

---

## (a) Google Cloud einrichten und OAuth-Client anlegen

Das ist der aufwendigste Teil, dauert einmalig etwa 15 Minuten. Du brauchst nur
ein normales Google-Konto, keine Kreditkarte und keine Zahlungsdaten.

### 1. Projekt anlegen

1. Öffne **https://console.cloud.google.com**.
2. Oben in der blauen Leiste auf die Projektauswahl klicken → **"Neues Projekt"**.
3. Name z.B. `vitalsync`, dann **"Erstellen"**. Warte, bis das Projekt oben
   ausgewählt ist.

### 2. Google Health API aktivieren

1. Links im Menü **"APIs & Dienste" → "Bibliothek"**.
2. Nach **"Google Health API"** suchen, anklicken, **"Aktivieren"**.

### 3. Zustimmungsbildschirm konfigurieren

1. **"APIs & Dienste" → "OAuth-Zustimmungsbildschirm"**.
2. Nutzertyp **"Extern"** wählen (das ist auch für den reinen Eigengebrauch der
   richtige Typ) und die Pflichtfelder ausfüllen: App-Name (z.B. VitalSync),
   deine E-Mail als Support-Adresse und als Entwicklerkontakt.
3. Bei **"Testnutzer"** deine eigene Google-Adresse hinzufügen – also das Konto,
   mit dem deine Fitbit-Daten verknüpft sind.
4. Die App **im Status "Test" belassen**. Für den privaten Gebrauch ist das der
   einfachste Weg (siehe Kasten unten).

> **Wichtig – die 7-Tage-Regel:** Solange die App im Status "Test" steht,
> laufen die von Google ausgestellten Refresh-Tokens nach **7 Tagen** ab. Du
> musst VitalSync dann einmal antippen und neu verbinden – deine gespeicherten
> Daten und dein Verlauf bleiben dabei erhalten. Wer das vermeiden will, müsste
> die App auf "Produktion" veröffentlichen; weil Gesundheitsdaten von Google als
> sensibel eingestuft werden, ist dafür ein Überprüfungsverfahren nötig, das
> für eine reine Privat-App unverhältnismäßig ist.

### 4. OAuth-Client erstellen

1. **"APIs & Dienste" → "Anmeldedaten" → "Anmeldedaten erstellen" →
   "OAuth-Client-ID"**.
2. Anwendungstyp: **"Webanwendung"**.
3. Unter **"Autorisierte JavaScript-Quellen"** eintragen:
   ```
   https://DEIN-GITHUB-NAME.github.io
   http://localhost:5173
   ```
4. Unter **"Autorisierte Weiterleitungs-URIs"** eintragen – **exakt**, inklusive
   Schrägstrich am Ende:
   ```
   https://DEIN-GITHUB-NAME.github.io/DEIN-REPO-NAME/
   http://localhost:5173/
   ```
5. **"Erstellen"**. Google zeigt dir jetzt die **Client-ID** (endet auf
   `.apps.googleusercontent.com`). Die brauchst du gleich.

Das ebenfalls angezeigte **Client-Secret brauchst du nicht** – der PKCE-Flow
kommt ohne aus. Siehe Troubleshooting, falls Google es doch verlangt.

### 5. Client-ID eintragen

In `src/config.js` die Zeile `clientId:` mit deiner Client-ID füllen. Sie ist
kein Geheimnis: Bei einem PKCE-Flow steht die Client-ID immer im Browser-Code.

---

## (b) GitHub-Repo und GitHub Pages

### (b.1) Repo erstellen und Code hochladen

1. Kostenloses Konto auf **https://github.com/signup**, falls noch nicht
   vorhanden.
2. Oben rechts **"+" → "New repository"**. Name frei wählbar, Sichtbarkeit
   **"Public"** (nötig für kostenloses GitHub Pages), **ohne** README
   initialisieren.
3. Code hochladen, z.B. lokal per Git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/DEIN-REPO.git
   git push -u origin main
   ```

### (b.2) GitHub Pages aktivieren

1. Im Repository: **Settings → Pages**.
2. Unter "Build and deployment" → **Source: "GitHub Actions"** (NICHT "Deploy
   from a branch"). Das Projekt bringt den fertigen Workflow
   `.github/workflows/deploy.yml` mit.
3. Der Workflow startet bei jedem Push auf einen beliebigen Branch und lässt
   sich zusätzlich manuell starten: Tab **"Actions"** → Workflow
   "Deploy VitalSync to GitHub Pages" → **"Run workflow"**.
4. Nach ein bis zwei Minuten ist die App erreichbar unter
   `https://DEIN-NAME.github.io/DEIN-REPO/`. Prüfe, dass diese Adresse exakt
   der Weiterleitungs-URI aus Schritt (a.4) entspricht.

---

## (c) VitalSync auf dem iPhone installieren

1. Die GitHub-Pages-Adresse in **Safari** auf dem iPhone öffnen (wichtig:
   Safari, nicht Chrome – nur Safari unterstützt auf iOS die vollwertige
   Installation).
2. Auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. **"Zum Home-Bildschirm"** wählen, Namen bestätigen, **"Hinzufügen"**.
4. VitalSync ab jetzt über das neue Icon starten – die App läuft dann im
   Vollbild ohne Safari-Leiste und bleibt mit den zuletzt geladenen Daten auch
   offline nutzbar.
5. Beim ersten Öffnen: **"Mit Google verbinden"**, den Zugriff auf Aktivität,
   Gesundheitswerte und Schlaf bestätigen, dann Profil und Lifestyle-Fragebogen
   ausfüllen. Die 90 Tage Historie laden im Hintergrund.

## Lokal entwickeln / testen

```bash
npm install
npm run dev       # Entwicklungsserver, http://localhost:5173
npm run build     # Produktions-Build nach dist/
npm run preview   # Baut nicht neu, dient nur zum lokalen Testen von dist/
```

Damit der Login lokal funktioniert, müssen `http://localhost:5173` (als
JavaScript-Quelle) und `http://localhost:5173/` (als Weiterleitungs-URI) in
deinem Google-OAuth-Client eingetragen sein – siehe Schritt (a.4).

## Troubleshooting

- **Google zeigt "Zugriff blockiert: Fehler bei der Autorisierung" /
  `redirect_uri_mismatch`**: Die Weiterleitungs-URI im OAuth-Client muss exakt
  der aufgerufenen Adresse entsprechen, inklusive Schrägstrich am Ende und mit
  korrekter Groß-/Kleinschreibung des Repo-Namens.
- **"Diese App ist nicht überprüft"**: Erwartetes Verhalten im Test-Status.
  Über "Erweitert" → "Weiter zu VitalSync" bestätigen. Voraussetzung ist, dass
  dein Konto unter "Testnutzer" eingetragen ist.
- **Nach etwa einer Woche kommt "bitte erneut verbinden"**: Das ist die
  7-Tage-Regel für Apps im Test-Status (siehe Kasten in Schritt a.3). Einmal
  neu verbinden genügt, gespeicherte Daten bleiben erhalten.
- **Token-Tausch scheitert mit "client_secret is missing"**: Dann verlangt
  Google für deinen Client doch ein Secret. Deploye in dem Fall den
  Mini-Worker aus `optional-token-helper/` (Anleitung als Kommentar in der
  Datei), hinterlege das Secret dort als verschlüsselte Variable und trage die
  Worker-Adresse in `src/config.js` als `tokenRelayUrl` ein. Das Secret
  gehört **nicht** in den Browser-Code.
- **Manche Kacheln zeigen "Keine Daten"**: Nicht jedes Gerät liefert jede
  Metrik (z.B. VO₂max oder SpO₂). Das betrifft dann gezielt nur diesen einen
  Wert – der Rest der App rechnet normal weiter, und fehlende Tage werden
  bewusst nicht als Null gewertet.
- **Gar keine Daten trotz erfolgreichem Login**: Prüfe, ob dein Fitbit-Konto
  bereits auf ein Google-Konto umgestellt ist und ob du dich mit genau diesem
  Konto angemeldet hast.

## Wichtiger Hinweis

VitalSync liefert Schätzwerte zur Selbstreflexion auf Basis vereinfachter,
nicht klinisch validierter Berechnungen (siehe Kommentare in
`src/models/biologicalAge.js`) – keine Diagnose, keine medizinische
Beratung.
