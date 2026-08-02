/*
create_master_docs.js -- Regeneriert die vier Master-Dokumente im Ordner
"Lisboa Assist" (Tripplanung, Spots, To-dos, Packliste).

ARCHITEKTUR-EINORDNUNG:
Normalerweise gilt Word -> data/*.json -> Website (Word ist Source of Truth).
Dieses Skript laeuft bewusst in die Gegenrichtung und wird nur nach einer
groesseren Umplanung aufgerufen, bei der ohnehin alle Kapitel neu geschrieben
werden -- ein manuelles Nachpflegen von 17 Trips in Word waere fehleranfaellig
und wuerde die Konsistenz zu trips.json brechen. Nach dem Lauf ist Word wieder
die Bearbeitungswahrheit.

Aufruf:  NODE_PATH=<docx-modul> node create_master_docs.js
*/
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
} = require("docx");

const BASE = __dirname;
const OUT = path.resolve(BASE, "..");            // Ordner "Lisboa Assist"
const data = JSON.parse(fs.readFileSync(path.join(BASE, "data", "trips.json"), "utf-8"));
const spots = JSON.parse(fs.readFileSync(path.join(BASE, "data", "spots.json"), "utf-8"));
const STAND = "02.08.2026";

// ---------- Bausteine ----------
const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { after: 160 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 90 } });
const H3 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 70 } });
const P = (t, opts = {}) => new Paragraph({ children: [new TextRun({ text: t, ...opts })], spacing: { after: 110 } });
const BULLET = (t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 60 } });
// Fett-Lead + normaler Rest in EINEM Absatz -- haelt Listen scanbar, ohne dass
// jede Zeile zur eigenen Ueberschrift wird.
const LEAD = (lead, rest, bullet = true) => new Paragraph({
  children: [new TextRun({ text: lead, bold: true }), new TextRun({ text: rest })],
  ...(bullet ? { bullet: { level: 0 } } : {}),
  spacing: { after: 70 },
});

// Tabellen brauchen columnWidths UND width je Zelle, beides in DXA.
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (text, bold, shade) => new TableCell({
    width: { size: widths[0], type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: "EFEBE4" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: !!bold, size: 19 })] })],
  });
  const mkRow = (cells, bold, shade) => new TableRow({
    children: cells.map((t, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: shade ? { type: ShadingType.CLEAR, fill: "EFEBE4" } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: String(t), bold: !!bold, size: 19 })] })],
    })),
  });
  return new Table({
    columnWidths: widths,
    width: { size: total, type: WidthType.DXA },
    rows: [mkRow(headers, true, true), ...rows.map((r) => mkRow(r))],
  });
}

function build(name, children) {
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log("geschrieben:", name);
  });
}

// ================= 1. TRIPPLANUNG =================
const CLUSTERS = ["Q1 -- Lissabon & Direktumgebung", "Q2 -- Portugal Festland",
                  "Q3 -- Portugal Inseln", "Q4 -- International"];

// Wochenend-Matrix: Statuszeilen leicht eingefaerbt, damit die Verteilung
// beim Durchblaettern sofort ins Auge springt.
const WE_FILL = { lissabon: "EAF3EC", auswaerts: "FBEDE2", deutschland: "EDEDED" };
const WE_LABEL = { lissabon: "in Lissabon", auswaerts: "auswärts", deutschland: "Deutschland" };

function wochenendMatrix(matrix) {
  const widths = [1800, 1400, 6600];
  const head = new TableRow({
    children: ["Wochenende", "Wo", "Was"].map((t, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: "DDD8CF" },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 19 })] })],
    })),
  });
  const rows = matrix.map((w) => new TableRow({
    children: [
      new TableCell({
        width: { size: widths[0], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: WE_FILL[w.status] },
        children: [new Paragraph({ children: [new TextRun({ text: w.wochenende, bold: true, size: 19 })] })],
      }),
      new TableCell({
        width: { size: widths[1], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: WE_FILL[w.status] },
        children: [new Paragraph({ children: [new TextRun({ text: WE_LABEL[w.status], size: 18 })] })],
      }),
      new TableCell({
        width: { size: widths[2], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: WE_FILL[w.status] },
        children: [
          new Paragraph({ children: [new TextRun({ text: w.was, bold: true, size: 19 })] }),
          new Paragraph({ children: [new TextRun({ text: w.hinweis, size: 17, italics: true })] }),
        ],
      }),
    ],
  }));
  return new Table({ columnWidths: widths, width: { size: 9800, type: WidthType.DXA }, rows: [head, ...rows] });
}

const MX = data._wochenend_matrix || [];
const nDE = MX.filter((w) => w.status === "deutschland").length;
const nAus = MX.filter((w) => w.status === "auswaerts").length;
const nLis = MX.filter((w) => w.status === "lissabon").length;
const nVerf = MX.length - nDE;

const tripplanung = [
  H1("Lissabon Trip- & Wochenend-Masterplan"),
  P(`Stand: ${STAND}. Enthält die Wochenend-Zwischenübersicht und die Dichte-Prüfung. Mit „Vorschlag“ markierte Termine sind unbestätigt – bitte gegenchecken; danach trage ich sie fix in den Kalender ein.`, { italics: true }),

  H2("1. Wochenend-Matrix – alle 22 Wochenenden"),
  P(`Die Trip-Liste zeigt nur, wo ihr hinfahrt. Die eigentlich wichtigere Frage beim Auslandssemester ist die Gegenrichtung: An wie vielen Wochenenden seid ihr überhaupt vor Ort? Deshalb hier jedes Wochenende, auch die ohne Trip. Tagesausflüge zählen bewusst als „in Lissabon“ – ihr schlaft abends in der eigenen Wohnung.`),
  wochenendMatrix(MX),
  P(`Bilanz: ${nVerf} Wochenenden in Portugal, davon ${nAus} auswärts (${Math.round(nAus / nVerf * 100)} %) und ${nLis} in Lissabon. ${nDE} Wochenenden fallen in die Weihnachtspause.`, { bold: true }),

  H2("2. Dichte-Prüfung: wo es zu viel war"),
  LEAD("Der kritische Block war 02.10. bis 06.12. ", `Zehn Wochenenden am Stück, davon wart ihr an acht nicht in Lissabon. Nach der Umschichtung sind es sieben – und die drei Wochenenden vor Ort liegen jetzt gleichmäßiger verteilt statt gebündelt.`),
  LEAD("Der härteste Engpass war der November. ", "Web Summit als Volunteer von Mo 09. bis Do 12.11. – das sind vier Tage Schichtdienst, keine Freizeit. Direkt danach war ein Reisewochenende (Nazaré) geplant, und ab Fr 20.11. ging es nach Marrakesch. Zwischen Web-Summit-Ende und Marrakesch-Abflug lag damit genau ein Wochenende, und das war belegt."),
  LEAD("Lösung: Nazaré wandert vom 14./15.11. auf den 16./17.01. ", "Das entlastet nicht nur den November, es ist auch sachlich besser. Nazaré ist ohnehin kein Kalendertrip, sondern ein Swell-Trip – das Wettkampffenster läuft bis 31.03.2027, und die großen Atlantiktiefs kommen typischerweise von November bis Februar. Zusätzlich füllt es den Januar, der nach dem Streichen der Serra da Estrela wieder leer war."),
  LEAD("Das freigewordene Wochenende 14./15.11. bekommt Sintra Tag A. ", "Ihr bleibt in der Region, es kostet keine Übernachtung, und der Sonntag bleibt Erholung."),
  LEAD("September und Januar sind bewusst locker. ", "Vier Wochenenden am Anfang komplett in Lissabon zum Ankommen, vier am Ende für den Prüfungszeitraum (04.–30.01.). Das ist kein Planungsloch, sondern Absicht."),
  LEAD("Erster weiterer Streichkandidat: Évora & Alqueva (28./29.11.). ", "Es liegt zwischen der Marrakesch-Rückkehr (Mo 23.11.) und dem Madeira-Abflug (Sa 05.12.). Falls das zu dicht wird: Évora allein ist ab Lissabon in 1:30 erreichbar und jederzeit als Tagesausflug nachholbar – nur die Sternenbeobachtung am Alqueva braucht die Übernachtung."),

  H2("3. Saisonalitäts-Prüfung: liegt jeder Trip zur richtigen Zeit?"),
  P("Kernfrage: Machen wir die Meer-Sachen, solange das Wasser warm ist – und die Schlechtwetter-tauglichen Sachen, wenn es regnerisch wird? Datengrundlage: An der Lissabonner Küste liegt die Wassertemperatur im September bei rund 18–20 °C, in Cascais mit etwa 20 °C sogar auf dem Jahreshöchstwert. Bis Oktober fällt sie auf rund 17 °C. Beim Regen ist es umgekehrt: Oktober rund 101 mm, November 128 mm an 13 Tagen – November ist der nasseste Monat des Jahres."),
  table(
    ["Trip", "Termin", "Urteil", "Begründung"],
    (data._saison_audit || []).map((a) => [a.trip, a.termin, a.urteil, a.warum]),
    [2200, 1500, 1300, 4800]
  ),
  P("Ergebnis: Ein echter Saisonfehler – die Arrábida lag Ende Oktober. Sie ist der Türkiswasser-Spot der Planung und jetzt auf den 13.09. vorgezogen. Alles andere liegt richtig: Die Nass-Monate November und Dezember sind mit Marrakesch, Alqueva, Madeira und dem Advent belegt, also mit Zielen, die entweder woanders liegen oder ohnehin drinnen stattfinden.", { bold: true }),

  H2("4. September – der wichtigste Monat, und er war halbleer"),
  P("Der September hat vier Wochenenden, also acht Tage. Belegt waren davon nur drei, und keiner davon war ein Badetag: Radfahren, Wandern und Surfern-Zuschauen. Dabei ist es genau der Monat, in dem das Meer am wärmsten ist und die Strände nach dem August wieder leer sind. Und ihr müsst euch ohnehin erst in der Umgebung zurechtfinden – das geht am besten mit kurzen, billigen Tagesausflügen statt mit Reisewochenenden."),
  LEAD("Sa 05. / So 06.09. – Ankommen. ", "Die Welcome Session und das Analytica Festival sind erst ab 17 Uhr. Tagsüber ist Zeit für den ersten Meerkontakt: Carcavelos ist 25 Minuten mit dem Zug und über die Navegante-Karte abgedeckt."),
  LEAD("So 13.09. – Arrábida. ", "Vorgezogen aus dem Oktober. Portinho da Arrábida und Praia dos Galapinhos zeigen nach Süden in die Bucht von Setúbal, deshalb ist das Wasser dort ruhiger und wärmer als am offenen Atlantik."),
  LEAD("So 20.09. – Sintra-Küste. ", "Mit dem historischen Eléctrico de Sintra (Straßenbahn von 1904) hinunter zur Praia das Maçãs und weiter nach Azenhas do Mar. Wichtig: Die schönste Bucht dieser Küste, die Praia da Adraga, ist ohne Auto NICHT erreichbar."),
  LEAD("Sa 26.09. – Cascais & Estoril. ", "Stand bisher nur als Spot ohne Termin in der Liste. Boca do Inferno, Altstadt, Baden an der Praia da Rainha."),
  LEAD("Wichtige Unterscheidung: Sintra-Küste im September, Sintra-Paläste im Winter. ", "Das ist kein Widerspruch, sondern Absicht. Die Strände brauchen Wärme, die Paläste brauchen leere Wege – und im Winter sind sie leer, billiger und der Nebel im Park macht genau die Stimmung, für die Sintra berühmt ist."),
  P("Alle vier Termine sind Tagesausflüge unter einer Stunde Anfahrt, fast alle über die Navegante-Karte abgedeckt. Sie sind bewusst als Optionen gedacht, nicht als Pflichtprogramm – im September habt ihr auch Wohnung, NIF und Uni-Start zu erledigen.", { italics: true }),

  H2("5. Was ihr in Lissabon selbst fast verpasst hättet"),
  LEAD("Sintra war die größte Lücke. ", "Sintra kam im gesamten Plan nur als Randnotiz vor (die Peninha als Spot), obwohl es UNESCO-Kulturlandschaft ist und mit Quinta da Regaleira, Castelo dos Mouros, Convento dos Capuchos, Monserrate und Pena fünf eigenständige Ziele hat – bei 40 Minuten Anfahrt. Das sind realistisch zwei volle Tage, deshalb jetzt bewusst auf zwei Termine gesplittet statt an einem Tag durchgehetzt. Und: Winter ist dort die beste Zeit, weil kaum jemand da ist und der Nebel im Palastpark genau die Stimmung macht, für die Sintra berühmt ist."),
  LEAD("Belém kam nur als Durchfahrt vor. ", "Mosteiro dos Jerónimos und Torre de Belém sind beide UNESCO-Welterbe. Das ist ein eigener Tag, kein Zwischenstopp auf der Radtour."),
  LEAD("Fado fehlte komplett. ", "UNESCO-immaterielles Kulturerbe und die Kunstform, für die Lissabon steht. Kein Party-Thema, sondern ein stiller Abend. In kleinen Tascas gibt es „Fado Vadio“ – Laien singen spontan, kein Eintritt."),
  LEAD("Cascais hatte nie einen eigenen Termin. ", "Stand nur als Spot in der Liste. Boca do Inferno und Praia do Guincho sind bei Sturm am eindrücklichsten – und alles läuft über die Navegante-Karte."),
  LEAD("Zwei Festivals liegen genau in eurem Zeitraum. ", "Doclisboa vom 15.–25.10.2026 und LEFFEST vom 06.–15.11.2026. Das LEFFEST-Eröffnungswochenende (07./08.11.) ist bei euch frei – der Web Summit startet erst am Montag danach."),
  LEAD("São Martinho am Mi 11.11. ", "Magusto mit Kastanien und Jeropiga, die ganze Stadt riecht danach. Fällt zwar mitten in den Web Summit, aber die Kastanienstände stehen den ganzen Spätherbst."),

  H2("6. Validierung: Abdeckung der vier Quadranten"),
  P("Die ursprüngliche Planung umfasste 9 Trips. Die Verteilung war deutlich unwuchtig – Nord- und Zentralportugal kamen überhaupt nicht vor, und der Januar war komplett leer."),
  table(
    ["Quadrant", "vorher", "jetzt", "Bewertung"],
    [
      ["Q1 – Lissabon & Direktumgebung", "4", "9", "War solide, aber rein westlich. Ergänzt um Ericeira, Sintra (2 Tage), Tejo-Ästuar, Advent, Ost-Lissabon/Cabo Espichel."],
      ["Q2 – Portugal Festland", "2", "5", "Größte Lücke: Norden und Binnenland fehlten ganz. Ergänzt um Porto/Douro/Minho, Nazaré, Évora/Alqueva. Serra da Estrela auf deinen Wunsch raus."],
      ["Q3 – Portugal Inseln", "1", "1", "Unverändert, aber Madeira von 2 auf 4 Tage verlängert – das war der gravierendste Planungsfehler."],
      ["Q4 – International", "2", "2", "Barcelona und Marrakesch bleiben. Sevilla und Kanaren liegen im Reserve-Pool."],
    ],
    [2900, 900, 900, 4300]
  ),
  P("Hinweis zur Streichung: Mit der Serra da Estrela fällt die einzige Schnee- und Hochgebirgsoption des Semesters weg. Der Bergpart hängt damit allein an Madeira. Sie liegt im Reserve-Pool – falls dein Klausurplan früh durch ist, wäre 23./24.01. der letzte realistische Slot.", { italics: true }),

  H2("7. Validierung: Balance Meer / Berge / Stadt"),
  P("Der auffälligste Befund: Von den sechs Outdoor- und Naturtrips der Ursprungsplanung waren fünf reine Küste und genau einer Berge (Madeira). Binnenland: null. Gezählt wird hier der jeweilige Haupt-Charakter eines Trips, deshalb summieren beide Spalten sauber auf."),
  table(
    ["Terrain-Typ (Haupt-Charakter)", "vorher", "jetzt"],
    [
      ["Meer & Küste", "5", "7"],
      ["Stadt & Kultur", "2", "6"],
      ["Binnenland & Natur", "0", "2"],
      ["Berge & Höhenmeter", "1 (nur Madeira)", "1 (nur Madeira)"],
      ["Wüste & Orient", "1", "1"],
      ["Summe", "9", "17"],
    ],
    [4000, 2500, 2500]
  ),
  P("Offen bleibt damit der Bergpart: Ohne die Serra da Estrela steht Madeira allein für Höhenmeter und Schnee gibt es gar nicht. Das ist eine bewusste Entscheidung, aber es lohnt, sie im Januar noch einmal anzuschauen.", { italics: true }),

  H2("8. Strukturelle Korrekturen"),
  LEAD("Madeira war unrealistisch geplant. ", "Der PR1 (Pico do Areeiro → Pico Ruivo) sind rund 7 km einfach mit ca. 1.100 Höhenmetern kumuliert – das ist ein voller Tag. Bei Sa-Anreise und So-Abflug bleibt kein Puffer, und am Areeiro liegt sehr häufig Wolke. Neu: Sa 05.12. – Di 08.12. Der 08.12. ist portugiesischer Feiertag (Imaculada Conceição), Mo 07.12. damit der einzige Fehltag. Nebeneffekt: 05.12. ist euer Jahrestag, 06.12. Mines Geburtstag."),
  LEAD("Das lange Oktober-Wochenende war ungenutzt. ", "Mo 05.10.2026 ist Feiertag (Implantação da República) – der NOVA-IMS-Kalender bestätigt das indirekt, weil der Ausfall am 26.10. nachgeholt wird. Sa 03. – Mo 05.10. ist damit das einzige lange Wochenende im Oktober und geht jetzt an Porto & Douro."),
  LEAD("Der Oktober war überladen. ", "Vier Reisewochenenden am Stück (10., 17., 24., 31.) ohne Erholungspause. Arrábida wird deshalb auf einen einzelnen Samstag reduziert; So 25.10. bleibt Puffer – an dem Tag ist außerdem Zeitumstellung."),
  LEAD("Der September war untergenutzt. ", "Vier Wochenenden bei bestem Wetter, aber nur zwei Ausflüge ganz ohne Datum. Jetzt terminiert und um Ericeira ergänzt."),
  LEAD("Der Januar war komplett leer. ", "Realistisch bleibt er das größtenteils auch: Der Prüfungszeitraum an der NOVA IMS läuft vom 04.01. bis 30.01.2027. Deshalb keine großen Reisen, sondern zwei fast kostenlose Tagesausflüge plus ein optionaler Schnee-Trip."),

  H2("9. Aktualisierter Zeitplan"),

  H3("September 2026 – Ankommen & Direktumgebung"),
  LEAD("Sa 12.09. – Cycling an der Marginal", " (Vorschlag): erstes freies Wochenende nach Welcome Week und Vorlesungsstart. Flach, 30 km, ohne Vorbereitung machbar."),
  LEAD("Sa 19.09. – Coastal Trekking Cabo da Roca → Praia da Ursa", " (Vorschlag): ca. 3 km einfach, ca. 150 hm steiler Abstieg. Kein markierter Weg – nicht bei Nässe."),
  LEAD("Do 24.09. – Gulbenkian-Konzert", " (steht bereits im Kalender): Tchaikovsky, Serenade for Strings, kostenlos mit Reservierung."),
  LEAD("So 27.09. – Ericeira, World Surfing Reserve", " (Vorschlag): Europas einziges World Surfing Reserve. Bus Mafrense ab Campo Grande, ca. 1 Std. Der Samstag davor ist frei – guter Slot für den Belém-Tag."),

  H3("Oktober 2026 – Goldener Herbst & Nordportugal"),
  LEAD("Fr 02. – Mo 05.10. – Porto, Douro & Minho", " (ERWEITERT, Vorschlag): jetzt vier Tage statt drei, weil Douro plus Guimarães plus Braga sich in drei Tagen nicht ausgehen. Mo 05.10. ist Feiertag, Fr 02.10. der einzige Fehltag. Alternative ohne Fehltag: Sa–Mo bleiben und den Douro-Tag streichen."),
  LEAD("Sa 10. – So 11.10. – Fisherman's Trail, Alentejo", " (Vorschlag, unverändert)."),
  LEAD("Sa 17. – So 18.10. – Algarve: Faro & Lagos", " (KONKRETISIERT, Vorschlag): Sa Faro mit Ria-Formosa-Bootstour, So Lagos mit Ponta da Piedade. Rückweg direkt ab Lagos, nicht über Faro – das spart zwei Stunden."),
  LEAD("Sa 24.10. – Parque Natural da Arrábida", " (Vorschlag, Tagesausflug): So 25.10. bleibt bewusst frei, Zeitumstellung."),
  LEAD("Sa 31.10. – So 01.11. – Barcelona", " (bestätigt)."),
  LEAD("Parallel: Doclisboa, 15. – 25.10.", " – internationales Dokumentarfilmfestival, läuft zehn Tage, unter der Woche gut machbar."),

  H3("November 2026 – Tech, Kultur & Kontraste"),
  LEAD("Sa 07. – So 08.11. – LEFFEST-Eröffnungswochenende", ": Lisbon & Estoril Film Festival, 06.–15.11. Ihr seid da, der Web Summit startet erst am Montag."),
  LEAD("Mo 09. – Do 12.11. – Web Summit Lissabon", " (bestätigt, Volunteer). Mi 11.11. ist São Martinho – Kastanien und Jeropiga in der ganzen Stadt."),
  LEAD("Sa 14. – So 15.11. – Sintra Tag A + Erholung", " (NEU): Quinta da Regaleira und Castelo dos Mouros. Bewusst kein Reisewochenende – nach vier Tagen Volunteer-Schichten und vor Marrakesch braucht ihr das."),
  LEAD("Fr 20. – Mo 23.11. – Marrakesch", " (BESTÄTIGT)."),
  LEAD("Sa 28. – So 29.11. – Évora & Dark Sky Alqueva", " (Vorschlag): weltweit erstes zertifiziertes Starlight Tourism Destination. Optional bis Di 01.12. (Feiertag). Termin auf Neumond legen. Erster Streichkandidat, falls es zu dicht wird."),

  H3("Dezember 2026 – Höhenmeter & Advent"),
  LEAD("Sa 05. – Di 08.12. – Madeira", " (BESTÄTIGT): vier Tage, Di 08.12. ist Feiertag. Jahrestag + Mines Geburtstag fallen hinein."),
  LEAD("Sa 12. – So 13.12. – Lissabon im Advent", " (Vorschlag): Wonderland Lisboa im Parque Eduardo VII. Bewusst ohne Anreise – das letzte volle Wochenende vor dem Heimflug."),
  LEAD("Fr 18.12. – Heimflug nach Deutschland", ". ACHTUNG: Der NOVA-IMS-Kalender sieht Nachholtermine am 21. und 22.12. vor (für die am 01. und 08.12. ausgefallenen Stunden). Prüfen, ob eure Kurse betroffen sind."),

  H3("Januar 2027 – Klausurzeit (Prüfungszeitraum 04. – 30.01.)"),
  LEAD("Do 07.01. – Rückkehr nach Lissabon", "."),
  LEAD("Sa 09.01. – Estuário do Tejo, Flamingos", " (Vorschlag): halber Tag, über die Navegante-Karte praktisch kostenlos. Zugvogel-Saison, im Januar die höchste Dichte."),
  LEAD("Sa 16. – So 17.01. – Nazaré Big Waves + Óbidos", " (VERSCHOBEN aus dem November): swell-abhängig. Bei flacher See auf 23./24.01. schieben."),
  LEAD("Sa 23. – So 24.01. – Lernwochenende + Sintra Tag B", ": Convento dos Capuchos und Monserrate. Zugleich Reserve-Slot für Nazaré."),
  LEAD("Sa 30. – So 31.01. – Abschluss: Marvila/Beato & Cabo Espichel", " (Vorschlag): direkt nach Prüfungsende, kostenlos, ohne Buchungsstress."),

  H2("10. Lissabon-Tage – Programm für die Wochenenden ohne Trip"),
  P("Kostet kein Reisewochenende: alles im Großraum Lissabon, meist über die Navegante-Karte abgedeckt."),
  ...(data._lissabon_tage || []).flatMap((t) => {
    const out = [LEAD(t.titel + ` (${t.wann}) – `, t.warum)];
    if (t.tipp) out.push(new Paragraph({
      children: [new TextRun({ text: "Tipp: ", bold: true, italics: true }), new TextRun({ text: t.tipp, italics: true })],
      indent: { left: 720 }, spacing: { after: 120 },
    }));
    return out;
  }),

  H2("11. Reserve-Pool – Ideen ohne festen Termin"),
  P("Fällt ein wetterabhängiger Trip aus, rücken diese nach:"),
  ...(data._reserve_pool || []).map((r) => LEAD(r.titel + " – ", r.warum)),

  H2("12. Offene Punkte"),
  BULLET("Termine gegenchecken und bestätigen – danach trage ich sie in den Google Kalender ein. Marrakesch und Madeira sind bereits bestätigt."),
  BULLET("Porto: entscheiden zwischen 4 Tagen mit einem Fehltag (Fr 02.10.) und 3 Tagen ohne Douro."),
  BULLET("Algarve: entscheiden zwischen Faro + Lagos (gut 8 Std. Fahrt insgesamt) und nur Lagos."),
  BULLET("Kollision prüfen: Heimflug 18.12. vs. NOVA-IMS-Nachholtermine am 21./22.12."),
  BULLET("Bei Parques de Sintra den akademischen Freizugang anfragen – es gibt dort keinen normalen Studentenrabatt."),
  BULLET("Serra da Estrela liegt im Reserve-Pool. Wenn der Klausurplan früh durch ist, wäre 23./24.01. der letzte realistische Schnee-Slot."),
];

// ================= 2. SPOTS =================
const spotsDoc = [
  H1("Lissabon Spots & Inspiration"),
  P(`Stand: ${STAND}. Laufend ergänzte Sammlung von Orten, Events und Cafés – sortiert nach Kategorie. Identisch mit data/spots.json und dem Google-My-Maps-Export.`, { italics: true }),
];
for (const cat of spots.kategorien) {
  spotsDoc.push(H2(cat.name));
  for (const s of cat.spots) {
    spotsDoc.push(LEAD(s.name + " – ", s.beschreibung));
    if (s.tipp) spotsDoc.push(new Paragraph({
      children: [new TextRun({ text: "Tipp: ", bold: true, italics: true }), new TextRun({ text: s.tipp, italics: true })],
      indent: { left: 720 }, spacing: { after: 120 },
    }));
  }
}

// ================= 3. TO-DOS =================
const todos = [
  H1("Lissabon To-dos"),
  P(`Stand: ${STAND}. Sortiert nach Priorität.`, { italics: true }),

  H2("⏳ Wartet auf Rückmeldung"),
  LEAD("DAAD-Stipendium (HAW.International 2026/2027) – ", "Rückmeldung im DAAD-Portal eingereicht (Stand 02.08.2026): Erklärung über Einkünfte, Enrollment Statement NOVA IMS und Krankenversicherungsnachweise hochgeladen. Jetzt Warten auf das verbindliche Zusageschreiben."),
  BULLET("Noch offen, falls vom DAAD nachgefragt: Ergebnis der Bewerbung um ein Zweitstipendium."),
  BULLET("Noch offen, falls vom DAAD nachgefragt: genaue Kurslaufzeit (Anfangs- und Enddatum)."),

  H2("🔴 Neu & zeitkritisch (aus der Validierung)"),
  LEAD("Trip-Termine bestätigen – ", "17 Trips stehen im Plan. Marrakesch und Madeira sind bestätigt, der Rest ist Vorschlag. Gegenchecken, dann trage ich sie in den Kalender ein."),
  LEAD("Porto-Format entscheiden – ", "4 Tage mit einem Fehltag (Fr 02.10., dafür Douro + Guimarães + Braga) oder 3 Tage ohne Douro. Danach erst buchen."),
  LEAD("Algarve-Format entscheiden – ", "Faro + Lagos an einem Wochenende heißt gut 8 Std. in Zug und Bus. Alternative: nur Lagos."),
  LEAD("Sintra-Freizugang anfragen – ", "Parques de Sintra gibt keinen normalen Studentenrabatt (Tickets über 10 €), aber Studierenden mit akademischer Arbeit auf vorherige Genehmigung freien Zugang. Als Free Mover an der NOVA IMS einen Antrag wert."),
  LEAD("Kollision 18.12. prüfen – ", "Der NOVA-IMS-Kalender sieht Nachholtermine am 21. und 22.12. vor (für 01. und 08.12.). Prüfen, ob eure fünf Kurse betroffen sind, bevor der Heimflug am 18.12. gebucht wird."),
  LEAD("Cartão Jovem (EYC) beantragen – ", "25 % Rabatt bei CP auf jeder Klasse, gültig 12–30 Jahre. Wichtig: Der normale CP-Jugendrabatt gilt nur bis 25 und NICHT auf Alfa Pendular. Für Porto, Covilhã und Algarve bewusst Intercidades statt Alfa buchen – Rabatte sind nicht kombinierbar."),
  LEAD("Porto & Douro buchen – ", "Feiertagswochenende 03.–05.10.: CP-Tickets und Hostel früh sichern, das lange Wochenende ist landesweit gefragt."),
  LEAD("Kalender aufräumen – ", "Zwei veraltete Platzhalter „Barcelona Wochenende?“ (23.–25.10. und 30.10.–02.11.) stehen neben dem festen Eintrag."),

  H2("🟡 Offen – aus der Trip-Planung"),
  LEAD("Gulbenkian-Konzert – ", "„Cartão Gulbenkian“ (kostenlose Kundenkarte) vorab online beantragen, schaltet den Buchungs-Button 24 Std. früher frei (vor dem 24.09.2026)."),
  LEAD("Fahrrad-Verleih – ", "Anbieter rund um den Bahnhof Cais do Sodré recherchieren und Preise vergleichen (Cycling Marginal, 12.09.)."),
  LEAD("Flug-Monitoring – ", "Preisalarme für Madeira (jetzt 4 Tage: 05.–08.12.) und Marrakesch (20.–23.11.) einrichten."),
  LEAD("Madeira-Logistik – ", "Unterkunft Funchal buchen, Taxi/Transfer zum Pico do Areeiro vorbestellen (Start vor Sonnenaufgang), PR1-Sperrungsstatus vor Abflug prüfen."),
  LEAD("Nazaré-Swell-Alert – ", "Wellenvorhersage für Praia do Norte abonnieren (Windguru/Magicseaweed). Die Big Wave Challenge wird erst bei über 8 m aktiviert und meist nur 2–3 Tage vorher angekündigt. Trip liegt jetzt auf 16./17.01., Reservetermine 23./24.01. und 30./31.01."),
  LEAD("Alqueva – ", "Neumond-Datum für Ende November 2026 prüfen und den Termin darauf legen. OLA-Führung auf Verfügbarkeit und Studentenpreis anfragen."),
  LEAD("Wonderland Lisboa – ", "Ab Oktober die offiziellen Termine 2026/27 prüfen (Erfahrungswert der Vorjahre: Ende November bis Anfang Januar)."),
  LEAD("Filmfestivals – ", "Doclisboa (15.–25.10.) und LEFFEST (06.–15.11.): Programm und Studententickets prüfen, sobald es online ist. LEFFEST-Eröffnungswochenende 07./08.11. ist frei."),
  LEAD("Cabo Espichel – ", "Busfahrplan ab Sesimbra prüfen, sehr dünn getaktet."),

  H2("✅ Erledigt / bereits geklärt"),
  BULLET("Urlaubssemester an der THA für WS 2026/27 (Okt.–März) genehmigt."),
  BULLET("Semesterbeitrag (181,95 €) trotz Beurlaubung geklärt."),
  BULLET("Krankenversicherungsnachweis geklärt."),
  BULLET("Learning Agreement genehmigt (14.04.2026): 5 Kurse, 22,5 ECTS."),
  BULLET("Free-Mover-Status an der NOVA IMS bestätigt (Studenten-Nr. 20261066)."),
  BULLET("NIF-Termin und Navegante-Karte für den 02.09.2026 im Kalender."),
];

// ================= 4. PACKLISTE =================
const packliste = [
  H1("Lissabon Packliste – Elias & Mine"),
  P(`Stand: ${STAND}. Nach Kategorien sortiert. Die Outdoor-Ausrüstung ergibt sich aus den geplanten Trips – mit der Validierung sind Schnee (Serra da Estrela), Höhenmeter (Madeira) und Nacht-Aktivitäten (Alqueva) dazugekommen, dafür braucht es Dinge, die vorher nicht auf der Liste standen.`, { italics: true }),

  H2("Dokumente & Bürokratie"),
  BULLET("Deutscher Personalausweis (Original)"),
  BULLET("Deutscher Adressnachweis (Internationale Meldebescheinigung oder englischer Kontoauszug)"),
  BULLET("Immatrikulationsbescheinigung von NOVA IMS"),
  BULLET("1 Passbild"),
  LEAD("Reisepass – ", "NEU: für Marrakesch (20.–23.11.) zwingend, der Personalausweis reicht für Marokko nicht. Gültigkeit prüfen: mindestens 6 Monate über das Rückreisedatum hinaus."),
  LEAD("Cartão Jovem / Europäische Jugendkarte – ", "NEU: 25 % CP-Rabatt auf jeder Klasse. Digital in der App reicht, wenn der Ausweis dabei ist."),
  LEAD("Internationale Studierendenbescheinigung (englisch) – ", "für Museums- und Verkehrsrabatte."),

  H2("Technik & Zubehör"),
  BULLET("Laptop und Peripherie"),
  BULLET("Alexa (Amazon Echo)"),
  BULLET("Tablet und Ersatzminen für den Tablet-Stift"),
  LEAD("Stirnlampe – ", "NEU und wirklich zwingend: Der PR1 auf Madeira (Pico do Areeiro → Pico Ruivo) führt durch mehrere unbeleuchtete Tunnel, und der Start liegt vor Sonnenaufgang. Auch für Alqueva praktisch – dort besser mit Rotlicht-Modus, das schont die Dunkeladaption."),
  LEAD("Fernglas – ", "NEU: für die Flamingos im Tejo-Ästuar (Januar) und für Alqueva. Ein leichtes 8×42 reicht völlig."),
  LEAD("Powerbank – ", "NEU: lange Wandertage mit Navigation ziehen das Handy leer."),

  H2("Uni & Schreibmaterial"),
  BULLET("Ersatz-Füllerpatronen"),
  BULLET("Federmäppchen mit Stift"),
  BULLET("College-Block"),

  H2("Outdoor-Ausrüstung"),
  LEAD("Wanderschuhe mit gutem Profil – ", "essenziell für die teils rutschigen Steilküsten (Coastal Trekking, Algarve, Fisherman's Trail)."),
  LEAD("Leichter Tages-Trekkingrucksack – ", "für ausgedehnte 6-Stunden-Touren."),
  LEAD("Wasser-/winddichte Hardshell-Jacke – ", "NEU: Nazaré und Cabo Espichel im Winter sind extrem windexponiert, Madeira-Höhen sind feucht."),
  LEAD("Warme Schicht: Fleece oder leichte Daunenjacke – ", "NEU: Madeira-Gipfel im Dezember und die Alentejo-Nacht bei Alqueva gehen in den einstelligen Bereich."),
  LEAD("Mütze und Handschuhe – ", "NEU: Serra da Estrela im Januar, dort liegt Schnee. Wer den Torre-Aufstieg wirklich macht, braucht außerdem Gamaschen oder wasserdichte Hosen – das lässt sich alternativ vor Ort leihen."),
  LEAD("Trinkflasche oder Trinkblase (mind. 1,5 l) – ", "NEU: auf dem PR1 und dem Fisherman's Trail gibt es unterwegs keine Nachfüllmöglichkeit."),
  LEAD("Blasenpflaster und kleines Erste-Hilfe-Set – ", "NEU: bei zwei Mehrtageswanderungen im Plan keine Kür."),
  LEAD("Badesachen und schnelltrocknendes Handtuch – ", "das Wasser ist im September und Oktober an Algarve und Arrábida noch warm."),
  LEAD("Sonnenbrille und Sonnencreme – ", "auch im Winter: Portugal hat sehr hohe Sonnenstunden, in der Serra da Estrela kommt Schneereflexion dazu."),
  P("Ergänzt euch gern gegenseitig – alles, was aus Deutschland mitgenommen werden soll, landet automatisch hier.", { italics: true }),
];

// ---------- Ausfuehrung ----------
Promise.all([
  build("Lissabon_Tripplanung.docx", tripplanung),
  build("Lissabon_Spots.docx", spotsDoc),
  build("Lissabon_To-dos.docx", todos),
  build("Lissabon_Packliste.docx", packliste),
]).then(() => console.log("Alle Master-Dokumente aktualisiert."));
