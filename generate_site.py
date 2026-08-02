#!/usr/bin/env python3
"""
generate_site.py -- Statischer Seiten-Generator fuer das Lisboa-Semester-Projekt.

ARCHITEKTUR-PRINZIP (siehe Chat-Historie):
Word-Dokumente (Lissabon_Tripplanung.docx, Lissabon_Spots.docx) bleiben die
alleinige Bearbeitungswahrheit ("Source of Truth"). Claude ueberfuehrt Aenderungen
daraus manuell/halbautomatisch in data/trips.json und data/spots.json.
Dieses Skript liest AUSSCHLIESSLICH aus data/*.json und erzeugt daraus die
statische Website in docs/ -- das ist der "Spiegel", nicht die Wahrheit.

Warum diese Trennung (Data/Presentation Layer)?
- Vermeidet einen bidirektionalen Sync (Word <-> Web), der ein klassisches
  Consistency-Problem waere (welche Version gilt bei Parallel-Edits?).
- data/*.json ist zugleich die gemeinsame Datenquelle fuer export_kml.py
  (Google-My-Maps-Export) -- ein Datensatz, mehrere Ausgabekanaele.

DEPLOYMENT:
docs/ ist bewusst der GitHub-Pages-Publish-Ordner (Repo-Einstellung:
"Pages -> Branch: main / Ordner: /docs"). Bei jedem `git push` baut GitHub
die Seite automatisch neu -- kein eigener Server, kein Webhook-Code noetig.

Aufruf: python3 generate_site.py  (im Repo-Root ausfuehren)
"""
import json
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DOCS_DIR = os.path.join(BASE_DIR, "docs")
TRIPS_OUT_DIR = os.path.join(DOCS_DIR, "trips")

# Status -> CSS-Klasse + Sortier-Prioritaet (bestaetigt zuerst anzeigen, dann Vorschlag, dann offen)
STATUS_ORDER = {"bestaetigt": 0, "vorschlag": 1, "offen": 2}
STATUS_CSS = {"bestaetigt": "status-bestaetigt", "vorschlag": "status-vorschlag", "offen": "status-offen"}

HTML_HEAD = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="{css_path}style.css">
</head>
<body>
"""
HTML_FOOT = """
<footer><p>Generiert aus Word-Dokumenten -- Stand: {stand}</p></footer>
</body>
</html>
"""


def load_json(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def render_trip_card(trip):
    """Kompakte Karte fuer die Uebersichtsseite (index.html)."""
    css = STATUS_CSS.get(trip["status"], "")
    return f"""
    <a class="card {css}" href="trips/{trip['slug']}.html">
      <span class="badge">{trip['status_label']}</span>
      <h3>{trip['title']}</h3>
      <p class="meta">{trip['zeitraum']}</p>
    </a>
    """


def render_trip_page(trip, stand):
    """Detailseite pro Trip mit allen Feldern aus trips.json."""
    css = STATUS_CSS.get(trip["status"], "")
    begruendung_html = f"<p><strong>Begruendung:</strong> {trip['begruendung']}</p>" if trip.get("begruendung") else ""
    logistik_html = f"<p><strong>Logistik:</strong> {trip['logistik']}</p>" if trip.get("logistik") else ""
    maps_html = f'<p><a class="maps-link" href="{trip["maps_link"]}" target="_blank">In Google Maps oeffnen</a></p>' if trip.get("maps_link") else ""
    body = f"""{HTML_HEAD.format(title=trip['title'], css_path='../')}
    <nav><a href="../index.html">&larr; Zur Uebersicht</a></nav>
    <main>
      <span class="badge {css}">{trip['status_label']}</span>
      <h1>{trip['title']}</h1>
      <p class="meta">{trip['zeitraum']}</p>
      <p>{trip['beschreibung']}</p>
      {logistik_html}
      {begruendung_html}
      {maps_html}
    </main>
    {HTML_FOOT.format(stand=stand)}"""
    return body


def render_spot_category(cat):
    items = "\n".join(
        f"""<li>
              <strong>{s['name']}</strong>
              <p>{s['beschreibung']}</p>
              {f"<p class='tipp'>Tipp: {s['tipp']}</p>" if s.get('tipp') else ""}
              <a href="{s['maps_link']}" target="_blank">In Google Maps oeffnen</a>
            </li>"""
        for s in cat["spots"]
    )
    return f"<h2>{cat['name']}</h2><ul class='spot-list'>{items}</ul>"


def build():
    trips_data = load_json("trips.json")
    spots_data = load_json("spots.json")
    stand = trips_data.get("stand", datetime.now().strftime("%Y-%m-%d"))

    os.makedirs(TRIPS_OUT_DIR, exist_ok=True)

    # --- index.html: Uebersicht aller Trips, sortiert nach Status ---
    trips_sorted = sorted(trips_data["trips"], key=lambda t: STATUS_ORDER.get(t["status"], 99))
    cards = "\n".join(render_trip_card(t) for t in trips_sorted)
    index_html = f"""{HTML_HEAD.format(title="Lissabon Semester -- Trip-Uebersicht", css_path='')}
    <header>
      <h1>Lissabon Semester -- Trip-Uebersicht</h1>
      <p>NOVA IMS, Sep 2026 -- Jan 2027</p>
      <p><a href="spots.html">Spots &amp; Inspiration ansehen &rarr;</a></p>
    </header>
    <main class="card-grid">
      {cards}
    </main>
    {HTML_FOOT.format(stand=stand)}"""
    with open(os.path.join(DOCS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html)

    # --- trips/<slug>.html: eine Detailseite je Trip ---
    for trip in trips_data["trips"]:
        with open(os.path.join(TRIPS_OUT_DIR, f"{trip['slug']}.html"), "w", encoding="utf-8") as f:
            f.write(render_trip_page(trip, stand))

    # --- spots.html: Spots gruppiert nach Kategorie ---
    categories_html = "\n".join(render_spot_category(c) for c in spots_data["kategorien"])
    spots_html = f"""{HTML_HEAD.format(title="Lissabon Spots & Inspiration", css_path='')}
    <nav><a href="index.html">&larr; Zur Trip-Uebersicht</a></nav>
    <header><h1>Spots &amp; Inspiration</h1></header>
    <main>
      {categories_html}
    </main>
    {HTML_FOOT.format(stand=stand)}"""
    with open(os.path.join(DOCS_DIR, "spots.html"), "w", encoding="utf-8") as f:
        f.write(spots_html)

    print(f"Website generiert: {DOCS_DIR}")
    print(f"  - index.html ({len(trips_data['trips'])} Trips)")
    print(f"  - spots.html ({len(spots_data['kategorien'])} Kategorien)")
    print(f"  - trips/*.html ({len(trips_data['trips'])} Detailseiten)")


if __name__ == "__main__":
    build()
