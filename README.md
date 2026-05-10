# ZenFeed: Minimalist Video Aggregation Interface
ZenFeed ist eine webbasierte, statische Anwendung zur Aggregation von Video-Inhalten. Das Projekt zielt darauf ab, eine ablenkungsfreie Umgebung für den Konsum von Lehr- und Informationsvideos zu schaffen, indem es auf algorithmische Empfehlungen, Kommentare und soziale Interaktionselemente verzichtet.

Demo: https://len-kadner.github.io/zenfeed/

## Technische Übersicht
Die Anwendung basiert auf einer reinen Client-Side-Architektur (HTML5, CSS3, JavaScript) und nutzt dezentrale Instanzen (Piped/Invidious-Schnittstellen) sowie RSS-Feeds zur Bereitstellung von Inhalten.

### Kernfunktionen
- **Kuratierung:** Benutzerdefinierte Erstellung eines Kanalkreises ohne Account-Zwang.
- **Engine:** Implementierung von asynchronem Parallel-Loading zum effizienten Abruf von RSS-Datenströmen.
- **Datenschutz:** Lokale Speicherung sämtlicher Präferenzen und Statistiken im Browser-Speicher (localStorage). Es findet kein serverseitiges Tracking statt.
- **Responsive Interface:** Optimierte Darstellung für Desktop- und Mobilgeräte unter Verwendung eines Bento-Grid-Layouts.

## Installation und Deployment
Da ZenFeed eine statische Web-Applikation ist, erfordert sie keine serverseitige Laufzeitumgebung.

1. Klonen des Repositories:
   `git clone https://github.com/len-kadner/zenfeed.git`
2. Bereitstellung:
   Die Dateien können über beliebige statische Hosting-Dienste wie GitHub Pages, Vercel oder Netlify bereitgestellt werden. Alternativ kann die `index.html` direkt lokal im Browser gestartet werden.

## Rechtliche Hinweise und Haftungsausschluss
Dieses Projekt wurde zu Bildungs- und Forschungszwecken entwickelt. ZenFeed ist ein unabhängiges Interface und steht in keiner geschäftlichen oder rechtlichen Verbindung zu Google LLC oder YouTube.

- Die Anwendung greift auf inoffizielle Schnittstellen von Drittanbietern zu. Die dauerhafte Verfügbarkeit dieser Dienste kann nicht garantiert werden.
- Die Nutzung der Software erfolgt auf eigene Verantwortung des Endnutzers.
- Der Entwickler übernimmt keine Haftung für Schäden oder Verstöße gegen Nutzungsbedingungen, die durch die Verwendung dieser Software entstehen könnten.

## Lizenz
Dieses Projekt ist unter der MIT-Lizenz lizenziert. Weitere Informationen finden Sie in der Datei LICENSE.

## Third-Party Assets
- Icons: [Lucide Icons](https://lucide.dev) (ISC License)
- Data Fetching: Public instances of [Piped](https://piped.video) and [Invidious](https://invidious.io)
