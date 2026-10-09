/**
 * Kuratierte Regeln für Live-TV-Streams.
 *
 * iptv-org listet neben offiziellen Sender-Streams auch Weiterverbreitungen
 * durch Dritte. Abspielbar sind in Rahim Cinema daher NUR Streams, deren Host
 * (und ggf. Pfad) einer hier eingetragenen offiziellen Infrastruktur des Senders
 * entspricht. Alle anderen Sender erscheinen nur im Verzeichnis mit Link zur
 * Sender-Website.
 *
 * Geprüft wurde: Host gehört erkennbar zur Sender-CDN (Name/Pfad des Senders).
 * NICHT belegt ist eine ausdrückliche Erlaubnis zur Einbettung durch Dritte –
 * daher embed = 'unclear' und immer ein Link zur offiziellen Seite.
 *
 * Neue Sender hinzufügen: Kanal-ID aus https://iptv-org.github.io/api/channels.json,
 * Host-Muster der offiziellen CDN, Regionen (falls geoblockiert) und Datum eintragen.
 */
export interface OfficialStreamRule {
  channel: string;
  hosts: RegExp[];
  /** optionaler Pfadfilter (z. B. internationale statt deutscher Variante) */
  path?: RegExp;
  /** Länder, in denen der Stream laut Sender/iptv-org-Label abrufbar ist; fehlt = keine Geosperre bekannt */
  regions?: string[];
  officialPage: string;
  note?: string;
  checkedAt: string;
}

const CHECKED = '2026-10-09';

export const OFFICIAL_STREAM_RULES: OfficialStreamRule[] = [
  { channel: 'DW.de', hosts: [/^dwamdstream\d+\.akamaized\.net$/], officialPage: 'https://www.dw.com/de/live-tv/s-100817', checkedAt: CHECKED },
  { channel: 'tagesschau24.de', hosts: [/^tagesschau\.akamaized\.net$/], officialPage: 'https://www.tagesschau.de/multimedia/livestreams', checkedAt: CHECKED },
  { channel: 'DasErste.de', hosts: [/^daserste-live\.ard-mcdn\.de$/], path: /\/int\//, officialPage: 'https://www.daserste.de/live/index.html', note: 'Internationale Fassung (einzelne Sendungen können aus Rechtegründen ersetzt sein)', checkedAt: CHECKED },
  { channel: 'ARDalpha.de', hosts: [/^mcdn\.br\.de$/], officialPage: 'https://www.ardmediathek.de/live', checkedAt: CHECKED },
  { channel: 'KiKA.de', hosts: [/^kikahls\.akamaized\.net$/], officialPage: 'https://www.kika.de/live', checkedAt: CHECKED },
  { channel: '3sat.de', hosts: [/^zdf-hls-\d+\.akamaized\.net$/], path: /\/dach\//, regions: ['DE', 'AT', 'CH', 'LI'], officialPage: 'https://www.3sat.de/live', note: 'Nur im deutschsprachigen Raum (DACH) abrufbar', checkedAt: CHECKED },
  { channel: 'ZDF.de', hosts: [/^zdf-hls-\d+\.akamaized\.net$/], path: /\/de\//, regions: ['DE'], officialPage: 'https://www.zdf.de/live-tv', note: 'Nur in Deutschland abrufbar', checkedAt: CHECKED },
  { channel: 'phoenix.de', hosts: [/^zdf-hls-\d+\.akamaized\.net$/], path: /\/de\//, regions: ['DE'], officialPage: 'https://www.phoenix.de/livestream', note: 'Nur in Deutschland abrufbar', checkedAt: CHECKED },
  { channel: 'arte.de', hosts: [/^artesimulcast\.akamaized\.net$/], regions: ['DE', 'AT', 'CH', 'FR', 'BE', 'LU'], officialPage: 'https://www.arte.tv/de/live/', note: 'Geoblockiert; Länderliste nicht offiziell bestätigt', checkedAt: CHECKED },
  { channel: 'arte.fr', hosts: [/^artesimulcast\.akamaized\.net$/], regions: ['DE', 'AT', 'CH', 'FR', 'BE', 'LU'], officialPage: 'https://www.arte.tv/fr/direct/', note: 'Geoblockiert; Länderliste nicht offiziell bestätigt', checkedAt: CHECKED },
  { channel: 'RTSInfo.ch', hosts: [/^rtsinfo-d\.akamaized\.net$/], officialPage: 'https://www.rts.ch/info/', checkedAt: CHECKED },
  { channel: 'Couleur3.ch', hosts: [/^visualradio-rts-couleur3-d\.akamaized\.net$/], officialPage: 'https://www.rts.ch/couleur3/', note: 'Visual Radio', checkedAt: CHECKED },
  { channel: 'Meteonews.ch', hosts: [/^streaming\.meteonews\.net$/], officialPage: 'https://meteonews.ch/', checkedAt: CHECKED },
  { channel: 'EuronewsGerman.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://de.euronews.com/live', checkedAt: CHECKED },
  { channel: 'EuronewsEnglish.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://www.euronews.com/live', checkedAt: CHECKED },
  { channel: 'EuronewsFrench.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://fr.euronews.com/live', checkedAt: CHECKED },
  { channel: 'EuronewsItalian.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://it.euronews.com/live', checkedAt: CHECKED },
  { channel: 'AfricanewsEnglish.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://www.africanews.com/live/', checkedAt: CHECKED },
  { channel: 'AfricanewsFrench.fr', hosts: [/^cdn-euronews\.akamaized\.net$/], officialPage: 'https://fr.africanews.com/live/', checkedAt: CHECKED },
  { channel: 'AlJazeera.qa', hosts: [/\.getaj\.net$/], officialPage: 'https://www.aljazeera.net/live', checkedAt: CHECKED },
  { channel: 'ORF2.at', hosts: [/\.mdn\.ors\.at$/], regions: ['AT'], officialPage: 'https://on.orf.at/', note: 'ORF-Streams sind in der Regel nur in Österreich abrufbar', checkedAt: CHECKED },
];

/** Prüft eine Stream-URL gegen die Regeln eines Senders. */
export function matchOfficialRule(channel: string, streamUrl: string): OfficialStreamRule | undefined {
  let u: URL;
  try {
    u = new URL(streamUrl);
  } catch {
    return undefined;
  }
  // Nur HTTPS (sonst blockiert der Browser auf einer HTTPS-Seite als "Mixed Content")
  if (u.protocol !== 'https:') return undefined;
  // Keine Streams mit eingebetteten Zugangstoken
  if (/tok_|token=|[?&](hdnts|hdnea)=/i.test(streamUrl)) return undefined;
  return OFFICIAL_STREAM_RULES.find((r) => r.channel === channel && r.hosts.some((h) => h.test(u.hostname)) && (!r.path || r.path.test(u.pathname)));
}
