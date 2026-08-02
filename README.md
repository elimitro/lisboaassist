# Lissabon Semester -- Trip-Website

**Architektur:** `Lissabon_Tripplanung.docx` / `Lissabon_Spots.docx` (im Ordner "Lisboa Assist")
bleiben die alleinige Bearbeitungswahrheit. Claude ueberfuehrt Aenderungen daraus in
`data/trips.json` / `data/spots.json`. `generate_site.py` baut daraus `docs/` (die
statische Website). `export_kml.py` baut daraus `kml-exports/lissabon_spots.kml`
(Batch-Import fuer Google My Maps). Du bearbeitest nie `docs/` direkt -- das wird
bei jeder Aktualisierung ueberschrieben.

## Einmaliges Setup: GitHub-Repo + Pages

1. **Repo anlegen:** Auf github.com ein neues, privates Repository erstellen (z.B. `lisboa-semester`).
2. **Diesen Ordner verknuepfen:** Diesen kompletten Ordner ("Trip bzw Eventpläne") lokal
   als Git-Repo initialisieren und mit dem GitHub-Repo verbinden. Am einfachsten mit
   **GitHub Desktop**:
   - GitHub Desktop installieren, anmelden.
   - "Add local repository" -> diesen Ordner auswaehlen.
   - Falls noch kein Git-Repo: Desktop bietet "create a repository" an -> bestaetigen.
   - "Publish repository" klicken (Haekchen bei "Keep this code private" setzen, falls privat).
3. **GitHub Pages aktivieren:**
   - Im Repo auf GitHub: Settings -> Pages.
   - Unter "Build and deployment": Branch = `main`, Ordner = `/docs`.
   - Speichern. Nach ca. 1 Minute ist die Seite live unter
     `https://<dein-github-name>.github.io/<repo-name>/`.
4. **Ab jetzt laufend:** Wann immer Claude neue Inhalte generiert (neuer Trip,
   neue Spots), aendern sich Dateien in diesem Ordner. Du musst nur noch in
   GitHub Desktop auf **"Commit" -> "Push origin"** klicken -- GitHub Pages baut
   die Seite automatisch neu. Kein Server, kein Webhook-Code noetig.

## Google-Maps-Export (Spots)

Auf Zuruf (oder wenn sich `Lissabon_Spots.docx` merklich aendert) generiert Claude
`kml-exports/lissabon_spots.kml` neu. Import in eine eigene, teilbare Karte:

1. [mymaps.google.com](https://mymaps.google.com) oeffnen -> "Neue Karte erstellen".
2. "Importieren" -> `kml-exports/lissabon_spots.kml` auswaehlen.
3. Jede Kategorie (Kultur & Events, Cafes & Szene, Outdoor & Natur) erscheint als
   eigene, einzeln ein-/ausblendbare Ebene.
4. Karte per Link teilen oder in der Google-Maps-App unterwegs nutzen (App: Gespeichert
   -> Karten -> deine importierte Karte).

Das ist ein manueller Ein-Klick-Import bei Bedarf -- kein Live-Sync, aber auch kein
Medienbruch zur echten Maps-App, die du ohnehin unterwegs nutzt.

## Lokale Scripts

```bash
python3 generate_site.py   # baut docs/ aus data/*.json
python3 export_kml.py      # baut kml-exports/*.kml aus data/spots.json
```
