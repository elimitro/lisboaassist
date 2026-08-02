/*
create_trip_docs.js -- Erzeugt aus data/trips.json fuer jeden Trip ein
einheitlich strukturiertes Word-Dokument (Bootstrap-Schritt).

WICHTIG (Richtungsumkehr gegenueber dem laufenden Betrieb):
Normalerweise gilt Word -> JSON -> Website (Word ist Source of Truth).
Dieses Skript laeuft NUR EINMALIG in die andere Richtung (JSON -> Word),
um die noch fehlenden Einzeldokumente ueberhaupt anzulegen. Ab jetzt
bearbeitet Elias die einzelnen Trip-Docx direkt; Claude synchronisiert
Aenderungen daraus zurueck nach data/trips.json (und damit auf die Website).
*/
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink,
  BorderStyle, AlignmentType, LevelFormat,
} = require("docx");

const BASE = __dirname;
const trips = JSON.parse(fs.readFileSync(path.join(BASE, "data", "trips.json"), "utf-8")).trips;
const OUT_DIR = path.join(BASE, "Trip-Docs");
fs.mkdirSync(OUT_DIR, { recursive: true });

const STATUS_COLOR = { bestaetigt: "2F7A4D", vorschlag: "C9713D", offen: "8A8A8A" };

function heading(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
}
function body(text) {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}
function mapsLink(url) {
  return new Paragraph({
    children: [new ExternalHyperlink({
      children: [new TextRun({ text: "In Google Maps öffnen", style: "Hyperlink" })],
      link: url,
    })],
    spacing: { after: 120 },
  });
}

function buildTripDoc(trip) {
  const children = [];

  children.push(new Paragraph({ text: trip.title, heading: HeadingLevel.HEADING_1 }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: trip.status_label, bold: true, color: STATUS_COLOR[trip.status] || "000000" }),
      new TextRun({ text: `   |   ${trip.zeitraum}`, italics: true }),
    ],
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 4 } },
  }));

  children.push(body(trip.beschreibung));

  if (trip.route_programm) { children.push(heading("Route & Programm")); children.push(body(trip.route_programm)); }
  if (trip.logistik) { children.push(heading("Logistik")); children.push(body(trip.logistik)); }
  if (trip.hoehenmeter_strecke) { children.push(heading("Strecke & Höhenmeter")); children.push(body(trip.hoehenmeter_strecke)); }
  if (trip.budget_rabatte) { children.push(heading("Budget & Rabatte")); children.push(body(trip.budget_rabatte)); }
  if (trip.wetter_hinweis) { children.push(heading("Wetter-Hinweis")); children.push(body(trip.wetter_hinweis)); }
  if (trip.begruendung) { children.push(heading("Begründung (Terminwahl)")); children.push(body(trip.begruendung)); }

  if (trip.naechste_schritte && trip.naechste_schritte.length) {
    children.push(heading("Nächste Schritte"));
    trip.naechste_schritte.forEach(item => children.push(bullet(item)));
  }

  if (trip.maps_link) { children.push(heading("Links")); children.push(mapsLink(trip.maps_link)); }

  children.push(new Paragraph({
    children: [new TextRun({ text: `Spiegelt auf: docs/trips/${trip.slug}.html -- bei Änderungen hier bitte Claude Bescheid geben, damit die Website aktualisiert wird.`, italics: true, size: 18, color: "999999" })],
    spacing: { before: 300 },
  }));

  return new Document({
    numbering: { config: [{ reference: "default-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }] }] },
    sections: [{ properties: {}, children }],
  });
}

(async () => {
  const gesperrt = [];
  for (const trip of trips) {
    const doc = buildTripDoc(trip);
    const buf = await Packer.toBuffer(doc);
    const fname = `Lissabon_Trip_${trip.slug}.docx`;
    try {
      fs.writeFileSync(path.join(OUT_DIR, fname), buf);
      console.log("erstellt:", fname);
    } catch (err) {
      // Word haelt geoeffnete Dokumente exklusiv gesperrt (erkennbar an der
      // ~$-Sperrdatei daneben). Ein einzelnes offenes Dokument darf nicht den
      // gesamten Generierungslauf abbrechen -- sonst sind die restlichen
      // Dateien inkonsistent zu trips.json.
      if (err.code === "EACCES" || err.code === "EBUSY" || err.code === "EPERM") {
        gesperrt.push(fname);
        console.warn("UEBERSPRUNGEN (in Word geoeffnet?):", fname);
      } else {
        throw err;
      }
    }
  }
  if (gesperrt.length) {
    console.warn(`\n${gesperrt.length} Datei(en) nicht aktualisiert. In Word schliessen und Skript erneut ausfuehren:`);
    gesperrt.forEach((f) => console.warn("  -", f));
  }
})();
