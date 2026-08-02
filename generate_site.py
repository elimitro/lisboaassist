#!/usr/bin/env python3
"""
generate_site.py -- Statischer Seiten-Generator fuer das Lisboa-Semester-Projekt.

ARCHITEKTUR-PRINZIP (siehe Chat-Historie):
Word-Dokumente (Lissabon_Tripplanung.docx, die einzelnen Trip-Docx-Dateien,
Lissabon_Spots.docx) bleiben die alleinige Bearbeitungswahrheit ("Source of
Truth"). Claude ueberfuehrt Aenderungen daraus manuell/halbautomatisch in
data/trips.json und data/spots.json. Dieses Skript liest AUSSCHLIESSLICH aus
data/*.json und erzeugt daraus die statische Website in docs/ -- das ist der
"Spiegel", nicht die Wahrheit.

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
import calendar
import json
import os
import re
from datetime import date, datetime, timedelta

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
    terrain = trip.get("terrain")
    terrain_html = f'<p class="terrain">{terrain}</p>' if terrain else ""
    # Datum bewusst VOR dem Titel und als groesstes Element der Karte:
    # In der Abstimmungsphase ist "wann" die Frage, nicht "was".
    return f"""
    <a class="card {css}" href="trips/{trip['slug']}.html">
      <span class="badge">{trip['status_label']}</span>
      <p class="card-datum">{trip['zeitraum']}</p>
      <h3>{trip['title']}</h3>
      {terrain_html}
    </a>
    """


# Reihenfolge der Quadranten auf der Uebersichtsseite. Trips ohne Cluster
# landen kontrolliert am Ende, statt die Gruppierung zu sprengen.
CLUSTER_ORDER = [
    "Q1 -- Lissabon & Direktumgebung",
    "Q2 -- Portugal Festland",
    "Q3 -- Portugal Inseln",
    "Q4 -- International",
]


MONATSNAMEN = {9: "September", 10: "Oktober", 11: "November", 12: "Dezember", 1: "Januar"}
WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _tage(von, bis):
    """Alle Kalendertage eines Zeitraums (inklusive beider Enden)."""
    a, b = date.fromisoformat(von), date.fromisoformat(bis)
    while a <= b:
        yield a
        a += timedelta(days=1)


def belegung_bauen(trips_data):
    """Baut ein Dict {date: eintrag} als Datenquelle fuer den Kalender.

    Einziger Ableitungspunkt: Die Trips liefern ihre Termine selbst mit
    (Feld `termine`), der Typ (in Lissabon vs. auswaerts) kommt aus dem
    Cluster. Damit muss beim Hinzufuegen eines Trips NICHTS am Kalender
    angepasst werden -- er waechst automatisch mit.

    Prioritaet bei Kollisionen: Trip > Uni-/Extratermin > Feiertag > abwesend.
    Hinweise (Konfliktmarker) werden separat gefuehrt und ueberlagern nur das
    Label, nicht die Farbe -- sonst wuerde z.B. der Heimflug den Trip verdecken.
    """
    extras = trips_data.get("_kalender_extras", {})
    bel, prio = {}, {}

    def setze(tag, typ, label, href, p):
        if prio.get(tag, -1) < p:
            bel[tag] = {"typ": typ, "label": label, "href": href}
            prio[tag] = p

    for e in extras.get("abwesend", []):
        for t in _tage(e["von"], e["bis"]):
            setze(t, "deutschland", "", None, 0)
    for f in extras.get("feiertage", []):
        t = date.fromisoformat(f["datum"])
        setze(t, "feiertag", "Feiertag", None, 1)
    for e in extras.get("termine", []):
        for t in _tage(e["von"], e["bis"]):
            setze(t, e.get("typ", "lissabon"), e["label"], None, 2)
    for trip in trips_data["trips"]:
        # Q1 = Grossraum Lissabon (Tagesausfluege), alles andere = Uebernachtung auswaerts
        typ = "lissabon" if trip.get("cluster", "").startswith("Q1") else "auswaerts"
        for zeit in trip.get("termine", []):
            for t in _tage(zeit["von"], zeit["bis"]):
                setze(t, typ, trip.get("kurz", trip["title"]), f"trips/{trip['slug']}.html", 3)

    # Feiertage faerben zusaetzlich ein, auch wenn ein Trip laeuft
    feiertage = {date.fromisoformat(f["datum"]): f["label"] for f in extras.get("feiertage", [])}
    hinweise = {}
    for h in extras.get("hinweise", []):
        for t in _tage(h["von"], h["bis"]):
            hinweise[t] = h["label"]
    return bel, feiertage, hinweise


def render_kalender(trips_data):
    """Monatsraster als Einstieg auf der Startseite. Jeder belegte Tag ist ein
    Link auf die zugehoerige Trip-Detailseite."""
    extras = trips_data.get("_kalender_extras")
    if not extras:
        return ""
    bel, feiertage, hinweise = belegung_bauen(trips_data)
    baender = {b["monat"]: b["label"] for b in extras.get("baender", [])}
    monate = []

    for ym in extras.get("monate", []):
        jahr, monat = int(ym[:4]), int(ym[5:7])
        band = f'<div class="kal-band">{baender[ym]}</div>' if ym in baender else ""
        zellen = ['<i class="kal-leer"></i>'] * date(jahr, monat, 1).weekday()
        for tag_nr in range(1, calendar.monthrange(jahr, monat)[1] + 1):
            tag = date(jahr, monat, tag_nr)
            eintrag = bel.get(tag)
            klassen = ["kal-tag"]
            if tag.weekday() >= 5:
                klassen.append("kal-we")
            if eintrag:
                klassen.append("kal-" + eintrag["typ"])
            if tag in feiertage:
                klassen.append("kal-feiertag")
            if tag in hinweise:
                klassen.append("kal-warn")
            label = hinweise.get(tag) or (eintrag or {}).get("label", "")
            if tag in feiertage and not label:
                label = "Feiertag"
            titel = feiertage.get(tag) or label or ""
            inner = (f'<span class="kal-nr">{tag_nr}</span>'
                     + (f'<span class="kal-lab">{label}</span>' if label else ""))
            href = (eintrag or {}).get("href")
            cls = " ".join(klassen)
            if href:
                zellen.append(f'<a class="{cls}" href="{href}" title="{titel}">{inner}</a>')
            else:
                zellen.append(f'<div class="{cls}" title="{titel}">{inner}</div>')
        kopf = "".join(f"<span>{w}</span>" for w in WOCHENTAGE)
        monate.append(
            f'<div class="kal-monat"><h3>{MONATSNAMEN[monat]} {jahr}</h3>{band}'
            f'<div class="kal-wk">{kopf}</div><div class="kal-grid">{"".join(zellen)}</div></div>'
        )

    legende = (
        '<div class="kal-legende">'
        '<span><i class="sw kal-lissabon"></i>Lissabon &amp; Umgebung</span>'
        '<span><i class="sw kal-auswaerts"></i>ausw&auml;rts</span>'
        '<span><i class="sw kal-feiertag"></i>Feiertag PT</span>'
        '<span><i class="sw kal-warn"></i>aufpassen</span>'
        '<span><i class="sw kal-deutschland"></i>Deutschland</span>'
        "</div>"
    )
    return f"""
    <section class="kalender">
      <h2>Semester-Kalender</h2>
      <p class="meta">Belegte Tage sind anklickbar und f&uuml;hren direkt zum Trip. Gr&uuml;n hei&szlig;t Tagesausflug &ndash; ihr schlaft in der eigenen Wohnung.</p>
      {legende}
      <div class="kal-monate">{"".join(monate)}</div>
    </section>
    """


def pruefe_termine(trips_data):
    """Konsistenzwaechter: `zeitraum` ist Anzeigetext, `termine` ist maschinenlesbar.
    Beide werden von Hand gepflegt und koennen auseinanderlaufen -- deshalb hier
    ein Abgleich beim Bauen statt einer stillen Inkonsistenz auf der Website."""
    probleme = []
    for trip in trips_data["trips"]:
        termine = trip.get("termine")
        if not termine:
            probleme.append(f"{trip['slug']}: keine maschinenlesbaren Termine")
            continue
        zeitraum = trip.get("zeitraum", "")
        for zeit in termine:
            for feld in ("von", "bis"):
                tag = date.fromisoformat(zeit[feld])
                # Im Anzeigetext muss mindestens Tag.Monat vorkommen
                if not re.search(rf"\b{tag.day:02d}\.{tag.month:02d}\.", zeitraum):
                    probleme.append(
                        f"{trip['slug']}: {tag.isoformat()} fehlt im Anzeigetext '{zeitraum}'")
    return probleme


STATUS_WE = {
    "lissabon": ("we-lissabon", "in Lissabon"),
    "auswaerts": ("we-auswaerts", "auswärts"),
    "deutschland": ("we-deutschland", "Deutschland"),
}


def render_wochenend_matrix(matrix):
    """Zeitachse ueber ALLE Wochenenden -- auch die ohne Trip.

    Warum das eine eigene Ansicht braucht: Die Trip-Liste zeigt nur, wo ihr
    hinfahrt. Die eigentliche Frage beim Auslandssemester ist aber die
    Gegenrichtung -- an wie vielen Wochenenden seid ihr ueberhaupt vor Ort?
    Ein Ausflug, der abends in der eigenen Wohnung endet, zaehlt hier bewusst
    als "in Lissabon"; nur Uebernachtungen ausserhalb zaehlen als "auswaerts"."""
    if not matrix:
        return ""
    verfuegbar = [w for w in matrix if w["status"] != "deutschland"]
    aus = sum(1 for w in verfuegbar if w["status"] == "auswaerts")
    rows = "\n".join(
        f'<tr class="{STATUS_WE[w["status"]][0]}">'
        f'<td class="we-datum">{w["wochenende"]}</td>'
        f'<td class="we-status">{STATUS_WE[w["status"]][1]}</td>'
        f'<td><strong>{w["was"]}</strong><br><span class="meta">{w["hinweis"]}</span></td></tr>'
        for w in matrix
    )
    return f"""
    <section class="matrix">
      <h2>Wochenend-Matrix &ndash; alle {len(matrix)} Wochenenden</h2>
      <p class="meta">{len(verfuegbar)} Wochenenden in Portugal, davon {aus} ausw&auml;rts
      ({round(aus / len(verfuegbar) * 100)}&nbsp;%) und {len(verfuegbar) - aus} in Lissabon.
      Tagesausfl&uuml;ge z&auml;hlen als &bdquo;in Lissabon&ldquo;.</p>
      <table class="we-table">
        <thead><tr><th>Wochenende</th><th>Wo</th><th>Was</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </section>
    """


def render_lissabon_tage(tage):
    """Programm fuer die Wochenenden OHNE Trip -- verbraucht keine Reisezeit."""
    if not tage:
        return ""
    items = "\n".join(
        f"<li><strong>{t['titel']}</strong> <span class='meta'>{t['wann']}</span>"
        f"<p>{t['warum']}</p>"
        + (f"<p class='tipp'>Tipp: {t['tipp']}</p>" if t.get("tipp") else "")
        + "</li>"
        for t in tage
    )
    return f"""
    <section class="reserve">
      <h2>Lissabon-Tage &ndash; f&uuml;r die Wochenenden ohne Trip</h2>
      <p class="meta">Kostet kein Reisewochenende: alles im Gro&szlig;raum Lissabon, meist &uuml;ber die Navegante-Karte abgedeckt.</p>
      <ul class="spot-list">{items}</ul>
    </section>
    """


def render_reserve_pool(pool):
    """Ideen ohne festen Termin: bewusst getrennt von den datierten Trips,
    damit die Zeitachse oben nicht mit Optionalem verwaessert wird."""
    if not pool:
        return ""
    items = "\n".join(
        f"<li><strong>{p['titel']}</strong> <span class='meta'>{p.get('cluster','')} &middot; "
        f"{p.get('terrain','')}</span><p>{p['warum']}</p></li>"
        for p in pool
    )
    return f"""
    <section class="reserve">
      <h2>Reserve-Pool &ndash; Ideen ohne festen Termin</h2>
      <p class="meta">Fallen Wetterfenster-Trips (Nazar&eacute;, Serra da Estrela) aus, r&uuml;cken diese nach.</p>
      <ul class="spot-list">{items}</ul>
    </section>
    """


def optional_block(label, value):
    """Rendert ein Detail-Feld nur, wenn im JSON tatsaechlich ein Wert steht (nicht null).
    Haelt die Detailseiten schlank, solange ein Trip noch nicht voll ausgeplant ist."""
    if not value:
        return ""
    return f'<p><strong>{label}:</strong> {value}</p>'


def render_naechste_schritte(items):
    if not items:
        return ""
    lis = "\n".join(f"<li>{item}</li>" for item in items)
    return f"<h3>Nächste Schritte</h3><ul class='todo-list'>{lis}</ul>"


def render_trip_page(trip, stand):
    """Detailseite pro Trip -- spiegelt alle Felder aus trips.json, die das
    jeweilige Trip-Docx bereits liefert. Felder ohne Wert (None) werden
    ausgeblendet statt als "None" angezeigt."""
    css = STATUS_CSS.get(trip["status"], "")
    blocks = "".join([
        optional_block("Route &amp; Programm", trip.get("route_programm")),
        optional_block("Logistik", trip.get("logistik")),
        optional_block("Strecke / Höhenmeter", trip.get("hoehenmeter_strecke")),
        optional_block("Budget &amp; Rabatte", trip.get("budget_rabatte")),
        optional_block("Wetter-Hinweis", trip.get("wetter_hinweis")),
        optional_block("Begründung", trip.get("begruendung")),
    ])
    naechste_schritte_html = render_naechste_schritte(trip.get("naechste_schritte"))
    maps_html = f'<p><a class="maps-link" href="{trip["maps_link"]}" target="_blank">In Google Maps öffnen</a></p>' if trip.get("maps_link") else ""

    body = f"""{HTML_HEAD.format(title=trip['title'], css_path='../')}
    <nav><a href="../index.html">&larr; Zur Übersicht</a></nav>
    <main>
      <span class="badge {css}">{trip['status_label']}</span>
      <h1>{trip['title']}</h1>
      <p class="detail-datum">{trip['zeitraum']}</p>
      <p class="lead">{trip['beschreibung']}</p>
      {blocks}
      {naechste_schritte_html}
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
              <a href="{s['maps_link']}" target="_blank">In Google Maps öffnen</a>
            </li>"""
        for s in cat["spots"]
    )
    return f"<h2>{cat['name']}</h2><ul class='spot-list'>{items}</ul>"


def build():
    trips_data = load_json("trips.json")
    spots_data = load_json("spots.json")
    stand = trips_data.get("stand", datetime.now().strftime("%Y-%m-%d"))

    # Frueh pruefen und laut sein: Ein Kalender, der stillschweigend vom
    # Anzeigetext abweicht, waere schlimmer als gar kein Kalender.
    probleme = pruefe_termine(trips_data)
    if probleme:
        print("WARNUNG -- Termine und Anzeigetext passen nicht zusammen:")
        for p in probleme:
            print("  -", p)

    os.makedirs(TRIPS_OUT_DIR, exist_ok=True)

    # --- index.html: Trips gruppiert nach Quadrant, innerhalb chronologisch ---
    # Bewusst NICHT mehr nach Status sortiert: Die Quadranten-Gruppierung macht
    # auf einen Blick sichtbar, ob die Abdeckung ausgewogen ist (Direktumgebung
    # vs. Festland vs. Inseln vs. Ausland) -- das war der eigentliche Zweck der
    # Validierung. Die Reihenfolge in trips.json ist bereits chronologisch.
    sections = []
    for cluster in CLUSTER_ORDER:
        group = [t for t in trips_data["trips"] if t.get("cluster") == cluster]
        if not group:
            continue
        cards = "\n".join(render_trip_card(t) for t in group)
        sections.append(
            f'<section class="cluster"><h2>{cluster} '
            f'<span class="meta">({len(group)} Trips)</span></h2>'
            f'<div class="card-grid">{cards}</div></section>'
        )
    ohne_cluster = [t for t in trips_data["trips"] if t.get("cluster") not in CLUSTER_ORDER]
    if ohne_cluster:
        cards = "\n".join(render_trip_card(t) for t in ohne_cluster)
        sections.append(f'<section class="cluster"><h2>Nicht zugeordnet</h2>'
                        f'<div class="card-grid">{cards}</div></section>')

    index_html = f"""{HTML_HEAD.format(title="Lissabon Semester -- Trip-Übersicht", css_path='')}
    <header>
      <h1>Lissabon Semester -- Trip-Übersicht</h1>
      <p>NOVA IMS, Sep 2026 -- Jan 2027 &middot; {len(trips_data['trips'])} Trips in 4 Quadranten</p>
      <p><a href="spots.html">Spots &amp; Inspiration ansehen &rarr;</a></p>
    </header>
    <main>
      {render_kalender(trips_data)}
      {render_wochenend_matrix(trips_data.get("_wochenend_matrix"))}
      {"".join(sections)}
      {render_lissabon_tage(trips_data.get("_lissabon_tage"))}
      {render_reserve_pool(trips_data.get("_reserve_pool"))}
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
    <nav><a href="index.html">&larr; Zur Trip-Übersicht</a></nav>
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
