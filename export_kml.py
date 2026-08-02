#!/usr/bin/env python3
"""
export_kml.py -- Batch-Export der Spots nach KML fuer Google My Maps.

WARUM KML STATT LIVE-FORMULAR ODER API-WRITE:
Bewusste Entscheidung gegen ein schreibendes Web-Formular ("Spot hinzufuegen"-Button),
weil das ein eigenes Backend + Auth braeuchte (siehe Chat-Diskussion). Stattdessen bleibt
Lissabon_Spots.docx die Datenhaltung; dieses Skript erzeugt bei Bedarf (auf Zuruf, nicht live)
eine KML-Datei, die manuell in Google My Maps importiert wird -- ein Ein-Klick-Import,
kein Medienbruch zur echten Maps-App unterwegs.

KML-Ordnerstruktur = My-Maps-Ebenen:
Google My Maps liest <Folder>-Elemente innerhalb einer KML als separate Layer/Ebenen ein.
Jede Kategorie aus spots.json (Kultur & Events, Cafes & Szene, Outdoor & Natur) wird so
automatisch zu einer eigenen, einzeln ein-/ausblendbaren Ebene in der importierten Karte.

Aufruf: python3 export_kml.py  (im Repo-Root ausfuehren, liest data/spots.json)
Ergebnis: kml-exports/lissabon_spots.kml -- in Google My Maps (mymaps.google.com)
          per "Importieren" einlesen.
"""
import json
import os
from datetime import datetime
from xml.sax.saxutils import escape

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUT_DIR = os.path.join(BASE_DIR, "kml-exports")


def load_spots():
    with open(os.path.join(DATA_DIR, "spots.json"), encoding="utf-8") as f:
        return json.load(f)


def placemark(spot):
    """Ein <Placemark> = ein Pin in Google My Maps.
    <description> darf simples HTML enthalten -- My Maps rendert das im Info-Fenster."""
    beschreibung = escape(spot["beschreibung"])
    tipp = f"<br/><i>Tipp: {escape(spot['tipp'])}</i>" if spot.get("tipp") else ""
    desc = f"{beschreibung}{tipp}"
    return f"""    <Placemark>
      <name>{escape(spot['name'])}</name>
      <description><![CDATA[{desc}]]></description>
      <Point>
        <coordinates>{spot['lon']},{spot['lat']},0</coordinates>
      </Point>
    </Placemark>"""


def build():
    data = load_spots()
    os.makedirs(OUT_DIR, exist_ok=True)

    folders = []
    total = 0
    for cat in data["kategorien"]:
        placemarks = "\n".join(placemark(s) for s in cat["spots"])
        total += len(cat["spots"])
        folders.append(f"""  <Folder>
    <name>{escape(cat['name'])}</name>
{placemarks}
  </Folder>""")

    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Lissabon Spots ({datetime.now().strftime('%Y-%m-%d')})</name>
{chr(10).join(folders)}
</Document>
</kml>
"""
    out_path = os.path.join(OUT_DIR, "lissabon_spots.kml")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(kml)

    print(f"KML-Export fertig: {out_path}")
    print(f"  - {len(data['kategorien'])} Ebenen (Folder), {total} Spots gesamt")
    print("  Import: mymaps.google.com -> Neue Karte -> Importieren -> diese Datei waehlen.")


if __name__ == "__main__":
    build()
