import type { SourceStatus } from '../../shared/types.ts';
import { useApi } from '../lib/api.ts';
import { ErrorState, Loading } from '../components/ui.tsx';

const TABLE = [
  { name: 'TMDB', purpose: 'Metadaten, Poster, Staffeln, Trailer, Anbieter', url: 'https://developer.themoviedb.org/', key: 'Ja (kostenlos)', limits: 'Nicht-kommerziell kostenlos; Ratenbegrenzung durch TMDB', terms: 'Quellenangabe „This product uses the TMDB API but is not endorsed or certified by TMDB“ + TMDB-Logo', id: 'tmdb' },
  { name: 'JustWatch (über TMDB)', purpose: 'Streaming-Anbieter je Land', url: 'https://www.justwatch.com', key: 'Nein (Teil von TMDB)', limits: 'wie TMDB', terms: 'Quellenangabe „JustWatch“ Pflicht', id: 'tmdb' },
  { name: 'TVmaze', purpose: 'Serien ohne Schlüssel (Fallback)', url: 'https://www.tvmaze.com/api', key: 'Nein', limits: 'Ratenbegrenzung (HTTP 429 → warten)', terms: 'CC BY-SA, Quellenangabe', id: 'tvmaze' },
  { name: 'Wikidata + Wikimedia Commons', purpose: 'Gemeinfreie/frei lizenzierte Filme', url: 'https://query.wikidata.org/', key: 'Nein', limits: 'SPARQL max. 60 s je Abfrage; User-Agent Pflicht', terms: 'Daten CC0; Videos gemäss Lizenz der Datei', id: 'wikidata' },
  { name: 'Internet Archive', purpose: 'Archivfilme (nur erweiterter Modus)', url: 'https://archive.org/developers/', key: 'Nein', limits: 'Fair Use der API', terms: 'Rechte gemäss Uploader-Angabe – nicht geprüft', id: 'archive' },
  { name: 'YouTube (offizielle Kanäle)', purpose: 'Ganze Filme von Rechteinhabern: Netzkino, Moviedome (DE/IT), Blender Studio', url: 'https://developers.google.com/youtube/v3', key: 'Ja (kostenlos)', limits: '10 000 Einheiten/Tag; Verbrauch ca. 30 je Aktualisierung (alle 12 h)', terms: 'YouTube-API-Nutzungsbedingungen; nur Videos mit erlaubter Einbettung; Wiedergabe im offiziellen Player', id: 'youtube' },
  { name: 'iptv-org', purpose: 'Senderverzeichnis, Logos, Stream-Kandidaten', url: 'https://github.com/iptv-org/api', key: 'Nein', limits: 'Statische JSON-Dateien (GitHub Pages)', terms: 'Daten: Unlicense. Streams gehören den Sendern', id: 'iptv' },
  { name: 'hls.js', purpose: 'HLS-Wiedergabe im Browser', url: 'https://github.com/video-dev/hls.js', key: '–', limits: '–', terms: 'Apache-2.0 (Software)', id: undefined },
];

export function SourcesPage() {
  const { data, error, loading, reload } = useApi<SourceStatus[]>('/sources');
  const statusOf = (id?: string) => data?.find((d) => d.id === id);

  return (
    <div className="page page-pad">
      <h1>Quellen &amp; Lizenzen</h1>
      <p className="lead">
        Rahim Cinema speichert und verteilt selbst keine Videos. Abgespielt werden ausschliesslich Dateien und Streams direkt von den Servern der Quelle. Softwarelizenzen (z. B. hls.js) sagen nichts über die Rechte an Videos aus – diese werden pro Quelle separat ausgewiesen.
      </p>

      <h2>Kennzeichnung</h2>
      <ul className="legend">
        <li><span className="badge badge-direct">▶ Direkt ansehen</span> belegte Freigabe (freie Lizenz, gemeinfrei für deine Region, ganzer Film auf einem offiziellen YouTube-Kanal des Rechteinhabers oder offizieller frei zugänglicher Sender-Stream)</li>
        <li><span className="badge badge-free_provider">Kostenlos beim Anbieter</span> gratis (evtl. mit Werbung) beim externen Anbieter – Wiedergabe dort</li>
        <li><span className="badge badge-subscription">Abo erforderlich</span> im Abo eines Streamingdienstes enthalten</li>
        <li><span className="badge badge-buy_rent">Kaufen/Mieten</span> nur als Kauf oder Leihe erhältlich</li>
        <li><span className="badge badge-none">Keine Quelle verfügbar</span> in den eingebundenen Quellen nichts für deine Region gefunden</li>
        <li><span className="tag tag-trailer">Trailer</span> nur Vorschau, nicht der ganze Film</li>
      </ul>

      <h2>Eingebundene Quellen</h2>
      {loading && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Zweck</th>
              <th>API-Key</th>
              <th>Kosten/Limits</th>
              <th>Nutzungsbedingungen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map((t) => {
              const st = statusOf(t.id);
              return (
                <tr key={t.name}>
                  <td>
                    <a href={t.url} target="_blank" rel="noopener noreferrer">
                      {t.name}
                    </a>
                  </td>
                  <td>{t.purpose}</td>
                  <td>{t.key}</td>
                  <td>{t.limits}</td>
                  <td>{t.terms}</td>
                  <td>
                    {!t.id ? (
                      'eingebaut'
                    ) : !st ? (
                      '–'
                    ) : !st.enabled ? (
                      'deaktiviert'
                    ) : !st.configured ? (
                      <span className="warn">kein Schlüssel</span>
                    ) : st.lastError ? (
                      <span className="warn" title={st.lastError}>Fehler: {st.lastError}</span>
                    ) : st.lastOkAt ? (
                      <span className="ok">OK ({new Date(st.lastOkAt).toLocaleTimeString('de-CH')})</span>
                    ) : (
                      'bereit (noch nicht abgefragt)'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Pflicht-Quellenangaben</h2>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming-Anbieterdaten: JustWatch. Seriendaten teilweise von TVmaze.com (CC BY-SA). Daten von Wikidata (CC0), Videos von Wikimedia Commons gemäss angegebener Lizenz. Senderverzeichnis: iptv-org (Unlicense).</p>
      <p className="muted small">Schriftarten: Systemschriften (keine externen Schrift-Server). Es werden keine Tracking-Dienste verwendet.</p>
    </div>
  );
}
