import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Channel, PlaybackSource } from '../../shared/types.ts';
import { useApi } from '../lib/api.ts';
import { actions } from '../lib/store.ts';
import { Player } from '../components/LazyPlayer.tsx';
import { AvailabilityBadge, ErrorState, Img, Loading, WatchlistButton } from '../components/ui.tsx';

export function ChannelPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const { data: ch, error, loading, reload } = useApi<Channel>(`/live/channel/${encodeURIComponent(id)}`);
  const [active, setActive] = useState<PlaybackSource>();
  const href = `/live/${encodeURIComponent(id)}`;

  useEffect(() => {
    setActive(ch?.streams.find((s) => s.availableInRegion));
    if (ch) actions.addHistory({ id: `channel:${ch.id}`, kind: 'channel', title: ch.name, posterUrl: ch.logoUrl, href });
  }, [ch, href]);

  if (loading && !ch) return <Loading />;
  if (error) return <div className="page page-pad"><ErrorState message={error.status === 404 ? 'Sender nicht gefunden.' : error.message} onRetry={error.status === 404 ? undefined : reload} /></div>;
  if (!ch) return null;

  const blocked = ch.streams.filter((s) => !s.availableInRegion);

  return (
    <div className="page page-pad">
      <p>
        <Link to="/live">← Alle Sender</Link>
      </p>
      <div className="channel-head">
        <div className="channel-logo channel-logo-lg"><Img src={ch.logoUrl} fallback={ch.name.slice(0, 2)} /></div>
        <div>
          <h1>{ch.name}</h1>
          <div className="hero-meta">
            <AvailabilityBadge value={ch.availability} />
            <span>
              {ch.countryFlag} {ch.countryName}
            </span>
            {ch.categories.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="hero-actions">
            <WatchlistButton item={{ id: `channel:${ch.id}`, kind: 'channel', title: ch.name, posterUrl: ch.logoUrl, href }} />
            {ch.website && (
              <a className="btn btn-ghost" href={ch.website} target="_blank" rel="noopener noreferrer">
                Website des Senders ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {active ? (
        <Player key={active.id} source={active} alternatives={ch.streams} live meta={{ title: ch.name, posterUrl: undefined, href }} onSwitch={setActive} />
      ) : (
        <div className="state">
          <p>
            <strong>Kein geprüfter Stream für deine Region.</strong>
          </p>
          {blocked.length > 0 ? (
            <p className="muted">Der offizielle Stream ist nur in folgenden Ländern verfügbar: {blocked.map((b) => (b.regions === 'worldwide' ? 'weltweit' : b.regions.join(', '))).join(' / ')}. Die Region kannst du in den Einstellungen ändern, sie hebt aber keine Geosperre auf.</p>
          ) : (
            <p className="muted">Für diesen Sender ist kein offizieller, frei zugänglicher Stream hinterlegt.{ch.hiddenUnverifiedStreams > 0 && ` ${ch.hiddenUnverifiedStreams} ungeprüfte Stream-Adresse(n) aus iptv-org wurden bewusst ausgeblendet.`}</p>
          )}
          {ch.website && (
            <a className="btn" href={ch.website} target="_blank" rel="noopener noreferrer">
              Beim Sender ansehen ↗
            </a>
          )}
        </div>
      )}

      {ch.streams.length > 0 && (
        <section className="options">
          <h2>Stream-Herkunft</h2>
          <ul className="source-list">
            {ch.streams.map((s) => (
              <li key={s.id} className={`source${s.id === active?.id ? ' is-active' : ''}${s.availableInRegion ? '' : ' is-disabled'}`}>
                <div className="source-main">
                  <strong>{s.label}</strong>
                  <div className="muted small">
                    {s.providerName} · Regel geprüft: {new Date(s.checkedAt).toLocaleDateString('de-CH')} · Region: {s.regions === 'worldwide' ? 'keine Geosperre bekannt' : s.regions.join(', ')}
                  </div>
                  {s.regionNote && <div className="muted small">{s.regionNote}</div>}
                  {s.embedNote && <div className="muted small">ℹ {s.embedNote}</div>}
                </div>
                <div className="source-actions">
                  <button className="btn btn-primary" disabled={!s.availableInRegion} onClick={() => setActive(s)}>
                    ▶ Abspielen
                  </button>
                  {s.homepage && (
                    <a className="btn btn-ghost" href={s.homepage} target="_blank" rel="noopener noreferrer">
                      Offizielle Seite ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">Ob ein Live-Stream tatsächlich läuft, hängt vom Sender ab (Sendezeiten, Geosperren, CORS-Freigabe). Ein Fernsehprogramm ist nicht eingebunden, da keine EPG-Quelle mit passenden Nutzungsbedingungen gefunden wurde.</p>
        </section>
      )}
    </div>
  );
}
