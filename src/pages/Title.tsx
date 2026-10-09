import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import type { PlaybackSource, SeasonDetail, TitleDetail } from '../../shared/types.ts';
import { AVAILABILITY_LABEL } from '../../shared/types.ts';
import { useApi } from '../lib/api.ts';
import { actions } from '../lib/store.ts';
import { Player } from '../components/LazyPlayer.tsx';
import { AvailabilityBadge, ErrorState, Img, Loading, Notices, WatchlistButton, titleHref } from '../components/ui.tsx';

const date = (d?: string) => (d ? new Date(d).toLocaleDateString('de-CH') : undefined);

function SourceList({ sources, active, onPlay }: { sources: PlaybackSource[]; active?: string; onPlay: (s: PlaybackSource) => void }) {
  return (
    <ul className="source-list">
      {sources.map((s) => (
        <li key={s.id} className={`source${s.id === active ? ' is-active' : ''}${s.availableInRegion ? '' : ' is-disabled'}`}>
          <div className="source-main">
            <div>
              {s.isTrailer ? <span className="tag tag-trailer">Trailer</span> : <AvailabilityBadge value={s.availableInRegion ? 'direct' : 'none'} small />}
              <strong> {s.label}</strong>
            </div>
            <div className="muted small">
              {s.providerName}
              {s.license && <> · {s.license.name}</>}
              {' · '}geprüft: {date(s.checkedAt)}
            </div>
            {s.license && <div className="muted small">Nachweis: {s.license.basis}</div>}
            {s.regionNote && <div className="muted small">{s.regionNote}</div>}
            {s.embed === 'unclear' && s.embedNote && <div className="muted small">ℹ {s.embedNote}</div>}
          </div>
          <div className="source-actions">
            <button className="btn btn-primary" disabled={!s.availableInRegion} onClick={() => onPlay(s)}>
              {s.isTrailer ? '▶ Trailer' : '▶ Abspielen'}
            </button>
            {s.homepage && (
              <a className="btn btn-ghost" href={s.homepage} target="_blank" rel="noopener noreferrer">
                Quelle ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Seasons({ detail }: { detail: TitleDetail }) {
  const seasons = detail.seasons ?? [];
  const firstRegular = seasons.find((s) => s.number > 0) ?? seasons[0];
  const [n, setN] = useState<number | undefined>(firstRegular?.number);
  const { data, error, loading, reload } = useApi<SeasonDetail>(n !== undefined ? `/title/${encodeURIComponent(detail.id)}/season/${n}` : null);
  if (!seasons.length) return null;
  return (
    <section className="seasons">
      <h2>Staffeln &amp; Episoden</h2>
      <div className="season-tabs" role="tablist">
        {seasons.map((s) => (
          <button key={s.number} role="tab" aria-selected={s.number === n} className={s.number === n ? 'is-active' : ''} onClick={() => setN(s.number)}>
            {s.number === 0 ? 'Specials' : `Staffel ${s.number}`}
            {s.episodeCount ? <small> · {s.episodeCount}</small> : null}
          </button>
        ))}
      </div>
      {loading && <Loading label="Episoden werden geladen …" />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && !loading && (
        <>
          {data.overview && <p className="muted">{data.overview}</p>}
          {data.episodes.length === 0 && <p className="muted">Für diese Staffel sind keine Episoden eingetragen.</p>}
          <ol className="episodes">
            {data.episodes.map((e) => (
              <li key={e.id} className="episode">
                <div className="episode-still"><Img src={e.stillUrl} fallback={String(e.episodeNumber)} /></div>
                <div>
                  <div className="episode-title">
                    <span className="muted">S{String(e.seasonNumber).padStart(2, '0')}E{String(e.episodeNumber).padStart(2, '0')}</span> {e.title}
                  </div>
                  <div className="muted small">
                    {date(e.airDate) ?? 'Datum unbekannt'}
                    {e.runtimeMin ? ` · ${e.runtimeMin} Min.` : ''}
                  </div>
                  {e.overview && <p className="episode-text">{e.overview}</p>}
                  <AvailabilityBadge value={e.sources.length ? 'direct' : detail.availability} known={e.sources.length > 0 || detail.availabilityKnown} small />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function TitlePage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const { data: d, error, loading, reload } = useApi<TitleDetail>(`/title/${encodeURIComponent(id)}`);
  const [active, setActive] = useState<PlaybackSource>();
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setActive(undefined), [id]);
  useEffect(() => {
    if (d) actions.addHistory({ id: d.id, kind: d.kind, title: d.title, posterUrl: d.posterUrl, year: d.year, href: titleHref(d.id) });
  }, [d]);

  const play = (s: PlaybackSource) => {
    setActive(s);
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const playable = useMemo(() => d?.sources.filter((s) => s.availableInRegion) ?? [], [d]);

  if (loading && !d) return <Loading />;
  if (error) return <div className="page page-pad"><ErrorState message={error.status === 404 ? 'Dieser Titel wurde nicht gefunden.' : error.message} onRetry={error.status === 404 ? undefined : reload} /></div>;
  if (!d) return null;

  return (
    <div className="page">
      <section className="detail-hero" style={{ ['--hero' as string]: d.backdropUrl ? `url("${d.backdropUrl}")` : 'none' }}>
        <div className="detail-inner">
          <div className="detail-poster"><Img src={d.posterUrl} alt={`Poster: ${d.title}`} fallback={d.title} /></div>
          <div className="detail-info">
            <p className="eyebrow">{d.kind === 'movie' ? 'Film' : 'Serie'}</p>
            <h1>{d.title}</h1>
            {d.originalTitle && d.originalTitle !== d.title && <p className="muted">Originaltitel: {d.originalTitle}</p>}
            <div className="hero-meta">
              <AvailabilityBadge value={d.availability} known={d.availabilityKnown} />
              {d.year && <span>{d.year}</span>}
              {d.runtimeMin && <span>{d.runtimeMin} Min.</span>}
              {d.rating ? <span>★ {d.rating.toFixed(1)}</span> : null}
              {d.genres.map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
            {d.tagline && <p className="tagline">„{d.tagline}“</p>}
            <p className="detail-text">{d.overview ?? 'Keine Beschreibung vorhanden.'}</p>
            {d.directors.length > 0 && <p className="muted">Regie: {d.directors.join(', ')}</p>}
            <div className="hero-actions">
              {playable[0] && (
                <button className="btn btn-primary" onClick={() => play(playable[0])}>
                  ▶ Direkt ansehen
                </button>
              )}
              {d.trailers[0] && (
                <button className="btn" onClick={() => play(d.trailers[0])}>
                  ▶ Trailer
                </button>
              )}
              <WatchlistButton item={{ id: d.id, kind: d.kind, title: d.title, posterUrl: d.posterUrl, year: d.year, href: titleHref(d.id) }} />
            </div>
          </div>
        </div>
      </section>

      <div className="page-pad">
        <div ref={playerRef}>
          {active && (
            <Player
              key={active.id}
              source={active}
              alternatives={active.isTrailer ? d.trailers : d.sources}
              meta={{ progressKey: active.isTrailer ? undefined : `title:${d.id}`, title: d.title, posterUrl: d.backdropUrl ?? d.posterUrl, href: titleHref(d.id) }}
              onSwitch={setActive}
            />
          )}
        </div>

        <Notices list={d.notices} />

        <section className="options">
          <h2>Wiedergabeoptionen in {d.offersRegion}</h2>
          {d.sources.length > 0 && (
            <>
              <h3>Direkt auf Rahim Cinema</h3>
              <SourceList sources={d.sources} active={active?.id} onPlay={play} />
            </>
          )}
          {d.offers.length > 0 && (
            <>
              <h3>Bei externen Anbietern</h3>
              <ul className="offers">
                {d.offers.map((o) => (
                  <li key={`${o.providerName}-${o.availability}-${o.note ?? ''}`} className="offer">
                    <div className="offer-logo"><Img src={o.logoUrl} fallback={o.providerName.slice(0, 2)} /></div>
                    <div>
                      <strong>{o.providerName}</strong>
                      <div>
                        <AvailabilityBadge value={o.availability} small /> {o.note && <span className="muted small">{o.note}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {d.offersLink && (
                <p>
                  <a href={d.offersLink} target="_blank" rel="noopener noreferrer">
                    Alle Angebote ansehen (TMDB) ↗
                  </a>
                </p>
              )}
              <p className="muted small">Anbieterdaten: JustWatch via TMDB. Preise und Verfügbarkeit können sich ändern. Fortschritt bei externen Anbietern wird hier nicht erfasst.</p>
            </>
          )}
          {d.trailers.length > 0 && (
            <>
              <h3>Trailer</h3>
              <SourceList sources={d.trailers} active={active?.id} onPlay={play} />
            </>
          )}
          {d.sources.length === 0 && d.offers.length === 0 && (
            <p className="muted">
              {AVAILABILITY_LABEL.none}: In den eingebundenen Quellen gibt es für deine Region keine Wiedergabeoption.
              {d.homepage && (
                <>
                  {' '}
                  <a href={d.homepage} target="_blank" rel="noopener noreferrer">
                    Offizielle Website ↗
                  </a>
                </>
              )}
            </p>
          )}
        </section>

        {d.kind === 'series' && <Seasons detail={d} />}

        {d.cast.length > 0 && (
          <section>
            <h2>Besetzung</h2>
            <ul className="cast">
              {d.cast.map((c) => (
                <li key={`${c.name}-${c.role}`}>
                  <div className="cast-photo"><Img src={c.photoUrl} fallback={c.name.slice(0, 1)} /></div>
                  <strong>{c.name}</strong>
                  {c.role && <small className="muted">{c.role}</small>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="provenance muted small">
          <h3>Datenherkunft</h3>
          <ul>
            {d.provenance.map((p) => (
              <li key={p.name}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.name}
                  </a>
                ) : (
                  p.name
                )}{' '}
                · abgerufen {new Date(p.fetchedAt).toLocaleString('de-CH')}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
