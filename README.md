# Rahim Cinema

Rahim Cinema ist eine Webseite für Filme, Serien und Live-TV. Die Oberfläche ist deutsch, die Standardregion ist die Schweiz. Freigegebene Inhalte laufen direkt auf der Seite, alles andere führt zum passenden Anbieter.

> **Wichtig:** Nicht alle Filme und Serien sind kostenlos. „Direkt ansehen“ erscheint nur, wenn eine geprüfte, freigegebene Quelle vorhanden ist.

Jeder Titel und jeder Sender ist eindeutig gekennzeichnet:

| Kennzeichnung | Bedeutung |
|---|---|
| **▶ Direkt ansehen** | Belegte Freigabe: freie Lizenz, gemeinfrei für deine Region oder offizieller, frei zugänglicher Sender-Stream. Läuft direkt auf der Seite. |
| **Kostenlos beim Anbieter** | Gratis (evtl. mit Werbung) bei einem externen Dienst. Wird dort abgespielt. |
| **Abo erforderlich** | Im Abo eines Streamingdienstes enthalten. |
| **Kaufen/Mieten** | Nur als Kauf oder Leihe erhältlich. |
| **Keine Quelle verfügbar** | Die eingebundenen Quellen kennen für deine Region keine Wiedergabeoption. |
| **TRAILER** | Nur eine Vorschau, nicht der ganze Film. |

---

## 1. Installation und Start (lokal)

Voraussetzung ist **Node.js 22 oder neuer** ([nodejs.org](https://nodejs.org), Version „LTS“ wählen).

```bash
# 1. Abhängigkeiten installieren (einmalig)
npm install

# 2. Optional: Konfigurationsdatei anlegen
cp .env.example .env        # Windows: copy .env.example .env

# 3a. Entwicklungsmodus (mit automatischem Neuladen)
npm run dev
# → http://localhost:8787 öffnen

# 3b. ODER Produktionsmodus
npm run build
npm start
# → http://localhost:8787 öffnen
```

Ohne weitere Einstellungen funktionieren bereits:

- **Live-TV**: Senderverzeichnis mit Logos, Länder-, Sprach- und Kategoriefilter. Geprüfte offizielle Streams sind direkt abspielbar.
- **Freie Filme**: Gemeinfreie oder frei lizenzierte Filme von Wikidata/Wikimedia Commons. Im erweiterten Modus kommt das Internet Archive dazu.
- **Serien** mit Staffeln und Episoden, ohne Schlüssel über TVmaze.
- **Merkliste, Verlauf, Weiterschauen und Einstellungen**, lokal im Browser gespeichert, ohne Konto.

### Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm run typecheck` | TypeScript-Prüfung |
| `npm test` | Automatische Tests (30 Tests, ohne Internet) |
| `npm run snapshot:iptv` | Offline-Abzug der iptv-org-Daten erneuern |

---

## 2. TMDB-Schlüssel (optional, für den grossen Katalog)

Mit TMDB erhältst du den vollständigen Film- und Serienkatalog, deutsche Beschreibungen, Besetzung und Trailer. Dazu kommen die Anbieter für die Schweiz (Netflix, Play Suisse usw.). Die Nutzung ist für nicht-kommerzielle Projekte kostenlos.

**So bekommst du den Schlüssel:**

1. Auf [themoviedb.org](https://www.themoviedb.org/signup) ein kostenloses Konto erstellen und die E-Mail bestätigen.
2. Oben rechts auf dein Profilbild klicken, dann **Einstellungen**, dann **API** ([direkter Link](https://www.themoviedb.org/settings/api)).
3. Einen API-Schlüssel beantragen („Developer“ / persönliche Nutzung) und das kurze Formular ausfüllen.
4. Danach siehst du zwei Werte. Kopiere den **„API Read Access Token“**, den langen Text, der meist mit `eyJ` beginnt.

**So trägst du ihn sicher ein:**

1. Im Projektordner die Datei `.env` öffnen (bei Bedarf aus `.env.example` kopieren).
2. Die Zeile so ausfüllen: `TMDB_READ_ACCESS_TOKEN=eyJ...dein-token...`
3. Den Server neu starten (`npm run dev` oder `npm start`).

Warum das sicher ist:

- Die Datei `.env` steht in `.gitignore` und wird nie hochgeladen.
- Der Schlüssel bleibt auf dem Server. Der Browser spricht nur mit `/api/...` und sieht den Schlüssel nie (automatisch getestet).
- Teile den Schlüssel nicht und schreib ihn nicht in den Quellcode.
- Für die Veröffentlichung trägst du ihn beim Hosting-Anbieter als „Environment Variable“ ein (siehe Abschnitt 6).

---

## 3. Aufbau

```
shared/            Gemeinsames Datenmodell (Filme, Serien, Episoden, Sender, Wiedergabequellen)
server/
  adapters/        Ein austauschbarer Adapter pro Quelle
    tmdb.ts          TMDB (+ JustWatch-Anbieterdaten)
    tvmaze.ts        TVmaze (Serien ohne Schlüssel)
    wikidata.ts      Wikidata + Wikimedia Commons (freie Filme)
    internetArchive.ts  Internet Archive (Lizenz nur vom Uploader erklärt)
    iptvOrg.ts       iptv-org (Senderverzeichnis), mit Offline-Abzug
  data/
    official-streams.ts  Kuratierte Regeln: welche Stream-Hosts offiziell sind
    iptv-snapshot.json   Offline-Abzug für den Fall, dass iptv-org nicht erreichbar ist
  services/        Zusammenführung, Regionen- und Lizenzlogik
  lib/             HTTP mit Zeitlimit/Wiederholungen, Cache, Status
  app.ts           API-Routen, Eingabeprüfung (zod), Sicherheits-Header, Ratenbegrenzung
src/               React-Frontend (Seiten, Player, Speicher)
tests/             Automatische Tests (+ Browser-Test in tests/e2e)
```

Was die einzelnen Teile leisten:

- **Wiedergabequellen** speichern Herkunft (`provider`), Region (`regions`), Wiedergabetyp (`hls`, `file`, `youtube`), Lizenz mit Nachweis und Vertrauensstufe. Dazu kommen Einbettungsstatus und Prüfzeitpunkt (`checkedAt`).
- **Externe Antworten** werden mit Schemas geprüft. Abrufe haben Zeitlimits und bis zu 2 Wiederholungen bei Netzwerkfehlern, 429 und 5xx; `Retry-After` wird berücksichtigt.
- **Cache:** Ergebnisse werden zwischengespeichert, je nach Quelle 1–24 Stunden. Fällt eine Quelle aus, nutzt der Server bis zu 24 Stunden lang den letzten guten Stand.
- **Videos laufen nicht über den eigenen Server.** Der Browser lädt sie direkt von der Quelle. Es werden keine Proxy-Dienste verwendet.

---

## 4. Eingebundene Quellen und Pflicht-Quellenangaben

| Name | Zweck | URL | API-Key | Kosten/Limits | Nutzungsbedingungen | Status |
|---|---|---|---|---|---|---|
| TMDB | Titel, Poster, Genres, Besetzung, Staffeln/Episoden, Trailer | developer.themoviedb.org | Ja (kostenlos) | Gratis für nicht-kommerzielle Nutzung; Ratenbegrenzung durch TMDB | Hinweis „This product uses the TMDB API but is not endorsed or certified by TMDB“ + TMDB-Logo | Integriert, mit nachgebildeten Antworten getestet |
| JustWatch (via TMDB `watch/providers`) | Anbieter je Land (CH) | justwatch.com | – | wie TMDB | Quellenangabe „JustWatch“ Pflicht | Integriert |
| TVmaze | Serien/Staffeln/Episoden ohne Schlüssel | tvmaze.com/api | Nein | Ratenbegrenzung (bei HTTP 429 warten) | CC BY-SA, Quellenangabe | Integriert, Fallback |
| Wikidata + Wikimedia Commons | Gemeinfreie/frei lizenzierte Filme mit Videodatei | query.wikidata.org, commons.wikimedia.org | Nein | SPARQL-Abfragen max. 60 s; aussagekräftiger User-Agent Pflicht | Daten CC0; Videos gemäss Dateilizenz (z. B. CC BY → Namensnennung) | Integriert |
| Internet Archive | Archivfilme mit Lizenzangabe | archive.org/developers | Nein | faire Nutzung | Lizenz nur vom Uploader erklärt → nur im erweiterten Modus abspielbar | Integriert |
| iptv-org | Senderverzeichnis, Logos, Stream-Kandidaten | github.com/iptv-org/api | Nein | statische JSON-Dateien | Daten: Unlicense; die Streams gehören den Sendern | Integriert, Offline-Abzug enthalten |
| hls.js | HLS-Wiedergabe | github.com/video-dev/hls.js | – | – | Softwarelizenz Apache-2.0 (sagt nichts über Videorechte) | Integriert (v1.7) |

**Pflicht-Quellenangaben** stehen im Fussbereich der Seite und unter `/quellen`.

- Das offizielle **TMDB-Logo** ist noch nicht eingebunden, weil es in der Entwicklungsumgebung nicht heruntergeladen werden konnte.
- Bitte lade es von [themoviedb.org/about/logos-attribution](https://www.themoviedb.org/about/logos-attribution) herunter und lege es als `public/tmdb.svg` ab.
- Danach im Footer (`src/components/Layout.tsx`) ein `<img src="/tmdb.svg">` ergänzen.

### Wie „Direkt ansehen“ geprüft wird

- **Filme (Wikidata/Commons):** Wikidata muss eine freie Lizenz (P275, z. B. Creative Commons) oder den Status „gemeinfrei“ (P6216) eintragen.
  - Bei „gemeinfrei“ zählt der Rechtsraum (P1001). Ein Film, der nur in den USA gemeinfrei ist, wird in der Schweiz **nicht** als „Direkt ansehen“ markiert.
  - Die Datei liegt auf Wikimedia Commons, das nur frei nutzbare Dateien zulässt.
- **Filme (Internet Archive):** Hier hat nur der Uploader die Lizenz angegeben. Das ist kein Nachweis, deshalb sind diese Filme im Standardmodus („streng“) nicht abspielbar. Unter Einstellungen → „Erweitert“ lassen sie sich mit Warnhinweis freischalten.
- **Live-TV:** iptv-org listet auch Weiterverbreitungen durch Dritte, zum Beispiel „SRF zwei“ über einen fremden Host. Abspielbar sind deshalb **nur** HTTPS-Streams, deren Host zur offiziellen Infrastruktur des Senders gehört (Liste in `server/data/official-streams.ts`).
  - Eine ausdrückliche Erlaubnis zur Einbettung durch Dritte ist bei keinem Sender dokumentiert. Das steht bei jedem Stream, zusammen mit dem Link zur offiziellen Seite.
  - Alle übrigen Sender erscheinen nur im Verzeichnis, mit Link zur Website.
- **Fernsehprogramm (EPG):** nicht eingebunden. iptv-org/epg liest Programmdaten von Drittseiten aus; eine Quelle mit klaren Nutzungsbedingungen für die Weiterveröffentlichung wurde nicht gefunden.

---

## 5. Was geprüft wurde und was nicht

**Wichtig:** Die Entwicklungsumgebung hatte nur Zugang zu GitHub und npm. TMDB, TVmaze, Wikidata, archive.org, iptv-org.github.io und alle Video- und Stream-Server waren gesperrt.

| Funktion | Implementiert | Getestet | Wie getestet |
|---|---|---|---|
| Ablauf Suche → Detailseite → Quelle wählen → Video spielt | ✅ | ✅ | Browsertest (Chromium); Video lief, `currentTime` > 1,5 s. API-Antworten nachgebildet, Video = lokal erzeugte Testdatei |
| HLS-Wiedergabe mit hls.js, Qualitätsauswahl | ✅ | ✅ | Lokaler HLS-Teststream (2 Qualitätsstufen), über die DW-Adresse umgeleitet |
| Fehlermeldung bei gesperrtem Stream | ✅ | ✅ | Simulierte HTTP-403-Antwort → Hinweis auf Geosperre + Link zur offiziellen Seite |
| Weitere geprüfte Quelle bei Ausfall | ✅ | teilweise | Schaltfläche vorhanden; mit mehreren Streams eines Senders nicht im Browser getestet |
| Staffeln und Episoden korrekt zugeordnet | ✅ | ✅ | TMDB- und TVmaze-Format, inkl. Specials ohne Nummer |
| Suche, Filter (Genre, Jahr, Sprache, kostenlos/direkt), Sortierung | ✅ | ✅ | API-Tests + Browsertest |
| Live-TV: Länder-/Sprach-/Kategoriefilter | ✅ | ✅ | mit **echten** iptv-org-Daten (Abzug vom 09.10.2026) |
| Drittanbieter-Restreams ausgeblendet, Geosperren je Region | ✅ | ✅ | echte iptv-org-Daten (z. B. SRF zwei ausgeblendet, ZDF nur DE, 3sat DACH) |
| Merkliste / Einstellungen bleiben nach Neuladen | ✅ | ✅ | Browsertest |
| „Weiterschauen“ (lokaler Fortschritt) | ✅ | ✅ | Browsertest; nur für direkt abgespielte Videos, nie für externe Anbieter |
| Mobile Ansicht (iPhone-Grösse) | ✅ | ✅ | 4 Seiten ohne horizontales Scrollen, Tab-Leiste, Video spielt |
| Fehlender Schlüssel / ausgefallene APIs | ✅ | ✅ | verständliche Hinweise statt Absturz; Live-TV fällt auf den Offline-Abzug zurück |
| Secrets vor dem Browser geschützt | ✅ | ✅ | Schlüssel weder in API-Antworten noch im ausgelieferten JavaScript |
| Build und Typprüfung | ✅ | ✅ | `npm run build`, `npm run typecheck`, `npm test` (30/30) |
| Echte Antworten von TMDB, TVmaze, Wikidata, Commons, Internet Archive | ✅ | ❌ **noch nicht überprüfbar** | gesperrt; Format laut Doku nachgebildet. Bitte nach dem ersten Start prüfen (Seite `/quellen` zeigt den Status) |
| Echte Live-Streams (DW, tagesschau24, RTS, 3sat, Euronews …) | ✅ | ❌ **noch nicht überprüfbar** | Stream-Server gesperrt. Ob sie laufen, hängt von Sender, Sendezeit, Geosperre und CORS ab |
| Safari/iOS (native HLS-Wiedergabe) | ✅ | ❌ | nur Chromium verfügbar |
| Docker-Image | ✅ | ❌ | Docker nicht verfügbar |

### Bekannte Einschränkungen

- **Wikidata-Abfrage ungetestet:** Die SPARQL-Abfrage (`server/adapters/wikidata.ts`) wurde nicht gegen den echten Dienst ausgeführt. Wird sie zu langsam (über 60 s), `LIMIT` verkleinern.
- **Videoformate:** Commons-Videos sind meist WebM (VP9). Ältere Safari-Versionen spielen das nicht ab; in dem Fall erscheint ein Hinweis mit Link zur Originalseite.
- **Externe Anbieter:** Anbieterdaten von TMDB/JustWatch können veraltet sein. Fortschritt bei externen Anbietern wird bewusst nicht erfasst.
- **Ohne TMDB-Schlüssel:** Es gibt keinen grossen Filmkatalog und keine Anbieterinfos zu Serien, weil TVmaze keine Schweizer Anbieterdaten hat.
- **Live-TV-Liste ist kuratiert:** Neue Sender müssen in `server/data/official-streams.ts` eingetragen werden, mit einer Regel für die offizielle CDN des Senders.

---

## 6. Veröffentlichen

Die App ist ein einzelner Node.js-Server (API + Webseite). Geeignet sind alle Anbieter, die Node.js 22 oder Docker ausführen. Freikontingente ändern sich oft. Die Angaben unten entsprechen dem letzten bekannten Stand und konnten hier nicht live überprüft werden, bitte vor der Wahl auf der Preisseite nachlesen.

### Variante A: Render (einfach, kostenloser Plan)

1. Projekt auf GitHub hochladen (die Datei `.env` wird nicht mit hochgeladen).
2. Auf [render.com](https://render.com) anmelden, **New → Blueprint** wählen und das Repository auswählen. Die Datei `render.yaml` wird erkannt.
3. Unter **Environment** eintragen: `TMDB_READ_ACCESS_TOKEN` (optional) und `CONTACT` (deine E-Mail für den User-Agent).
4. Nach dem Build ist die Seite unter `https://<name>.onrender.com` erreichbar (HTTPS automatisch).

- **Kostenloser Plan:** Der Dienst schläft nach etwa 15 Minuten ohne Besuch ein, der erste Aufruf dauert dann etwa 30–60 Sekunden. Es gibt ein monatliches Stundenkontingent. Aktuelle Werte: [render.com/pricing](https://render.com/pricing).
- **Mögliche Kosten:** Ohne Schlafmodus ab ca. 7 USD/Monat (Plan „Starter“).

### Variante B: Eigener Server / VPS mit Docker

```bash
docker build -t rahim-cinema .
docker run -d -p 8787:8787 --env-file .env --restart unless-stopped rahim-cinema
```

Davor einen Reverse-Proxy mit HTTPS schalten, zum Beispiel Caddy oder nginx mit Let's Encrypt.

- **Kosten:** Kleine VPS gibt es ab ca. 4–6 CHF/Monat (z. B. Infomaniak, Hetzner).

### Variante C: Andere Anbieter

Railway, Fly.io oder Koyeb funktionieren ebenfalls mit dem Dockerfile.

- **Railway:** Testguthaben, danach kostenpflichtig.
- **Fly.io:** Für neue Konten in der Regel nutzungsbasiert abgerechnet.

Vor der Wahl die aktuellen Preise prüfen.

**Laufende Kosten der Datenquellen:** keine. Alle eingebundenen APIs sind gratis; TMDB nur für nicht-kommerzielle Nutzung. Bei kommerzieller Nutzung (z. B. Werbung auf der Seite) ist eine TMDB-Lizenz nötig.

**Vor dem Veröffentlichen beachten:**

- Wenn die Seite öffentlich ist und Inhalte Dritter einbettet, ist ein **Impressum** und eine **Datenschutzerklärung** nötig. In der Schweiz gilt das revidierte DSG, in der EU die DSGVO.
- YouTube-Trailer laden erst nach Klick und über `youtube-nocookie.com`. Senderlogos und Poster werden direkt von den Bildservern der Quellen geladen.
- Bei Live-TV ist die Einbettungserlaubnis der Sender nicht dokumentiert. Im Zweifel beim Sender nachfragen oder die Streams nur verlinken. Dazu die Regel in `server/data/official-streams.ts` entfernen; der Sender bleibt im Verzeichnis mit Link.

---

## 7. Browser-Test selbst ausführen (optional)

```bash
npm run build
# Testmedien erzeugen (benötigt ffmpeg): siehe Kopf von tests/e2e/browser-flow.mjs
node tests/e2e/browser-flow.mjs <medienordner> <screenshotordner>
```

Der Test bildet die externen APIs nach und leitet Video-Hosts auf lokale Testvideos um. Er prüft also den eigenen Code, nicht die Erreichbarkeit der echten Quellen.
