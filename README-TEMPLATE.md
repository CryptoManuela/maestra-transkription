# Transkriptions-App — Teilnehmer-Vorlage

Schlanke, fal-only Variante der Transkriptions-App für Maestra-Teilnehmerinnen.
Der API-Key liegt **serverseitig** (Netlify-Env-Var `FAL_KEY`) — die Teilnehmerin
gibt nie einen Key ein. Installierbar als echte App (PWA).

Stand: 2026-06-17 · Status: **Ausbaustufe 2 gebaut (Prompts + KI-Ausgaben), Test-Deploy ausstehend.**

## Ausbaustufe 2 — eigene Prompts & KI-Ausgaben (NEU)
Nach der Transkription kann jede Teilnehmerin mit einem Klick einen fertigen Text
erzeugen — über **denselben fal-Key** (kein zweiter Account nötig).

- **Schritt 3 „Weiterverarbeiten":** Prompt wählen → Modell wählen → „Text erstellen".
- **7 Default-Prompts** aus dem KI-Maestra-Workbook „Der Baukasten" (4C-Struktur),
  editierbar, eigene hinzufügbar/löschbar, „Auf Standard zurücksetzen".
- **Profil** (Name, Signatur, Firma) — fließt über `{{name}}` / `{{signatur}}` /
  `{{firma}}` automatisch in jede Ausgabe ein. Eckige Platzhalter `[…]` füllt die
  Teilnehmerin pro Lauf selbst.
- **Stimme & Tabus** als globaler System-Prompt (editierbar in den Einstellungen).
- **Download** jeder Ausgabe als `.txt`, `.md` und Word (`.doc`).
- Alles client-seitig in `localStorage`, keine Datenbank.

### LLM-Transport — wichtig
- Läuft über **`openrouter/router`** auf fal (nicht das deprecatete `fal-ai/any-llm`).
- Standard-Modell: `anthropic/claude-sonnet-4.6`. Schnell: `anthropic/claude-haiku-4.5`.
- **Modell ist ein freier String** und im Frontend steuerbar (Einstellungen →
  Erweitert → Modell-ID). Ändern sich die Modelle, einfach neue ID eintragen —
  **kein Deploy nötig.** Der einzige Ort im Code: `LLM_ENDPOINT` / `DEFAULT_MODEL`
  oben in `netlify/functions/fal-llm.mjs`.
- Kosten: Centbeträge pro Aufruf über den fal-Account (Claude = Premium-Tarif).

## Was anders ist als die Live-App
- **Kein Anbieter-/Key-Feld mehr** — nur noch fal.ai, Key aus `FAL_KEY`.
- **Groq entfernt** (im Server-Key-Modell nicht nötig).
- **PWA**: `manifest.json` + `sw.js` → „Zum Home-Bildschirm" / „Installieren".
- Speaker-Trennung (nur Whisper), Multipart-Upload, Queue-Polling bleiben drin.

## Enthaltene Dateien
```
index.html                          ← schlanke UI (Schritt 1 Datei, Schritt 2 Optionen)
css/style.css                       ← Maestra-Design (Branding über CSS-Variablen :root)
js/app.js                           ← fal-only Transkriptions-Logik + Service-Worker
js/prompts.js                       ← Stimme + 7 Default-Prompts (Workbook „Baukasten")
js/postprocess.js                   ← Nachbearbeitung: Prompt-Manager, Profil, KI-Aufruf
manifest.json                       ← PWA-Manifest
sw.js                               ← Service Worker (cacht NICHT /api/)
netlify.toml                        ← publish=. , functions=netlify/functions
netlify/functions/fal-upload.mjs            ← Einzel-Upload-Init (Key aus FAL_KEY)
netlify/functions/fal-upload-multipart.mjs  ← Multipart-Init (Key aus FAL_KEY)
netlify/functions/fal-transcribe.mjs        ← Transkription Queue-Submit (Key aus FAL_KEY)
netlify/functions/fal-status.mjs            ← Status + Ergebnis, generisch (Key aus FAL_KEY)
netlify/functions/fal-llm.mjs               ← LLM Queue-Submit über openrouter/router (Key aus FAL_KEY)
```

## Deploy (Netlify)
1. Diese Vorlage in ein eigenes Repo legen (pro Teilnehmerin oder als Template-Repo).
2. Netlify-Projekt mit dem Repo verbinden (publish `.`, functions `netlify/functions`).
3. **Env-Var setzen:** `FAL_KEY` = der fal.ai-Key (Format `KEY_ID:KEY_SECRET`).
   Netlify → Project configuration → Environment variables.
4. Deploy. Fertig — App fragt nie nach einem Key.

> Für den späteren Self-Service-Weg: „Deploy to Netlify"-Button, der `FAL_KEY`
> beim Deploy abfragt (kommt im nächsten Schritt).

## NOCH OFFEN (nächste Schritte)
- [ ] **App-Icons** `icon-192.png` + `icon-512.png` + `favicon.png` ergänzen
      (für Installierbarkeit nötig; im Branding-Schritt generieren — Maestra-Logo).
- [ ] Veröffentlichung als Template-Repo + „Deploy to Netlify"-Button.
- [ ] Bebilderte Teilnehmer-Anleitung (fal-Key holen → deployen → installieren).
- [ ] Optional: Branding pro Teilnehmerin (CSS-Variablen `--berry` / `--gold` +
      Logo) — als Generator.

## Branding (für Personalisierung)
Farben sitzen in `css/style.css` unter `:root` (`--berry`, `--gold`, `--bg` …).
Für eine personalisierte Variante nur diese Variablen + Logo/Headertext tauschen.
