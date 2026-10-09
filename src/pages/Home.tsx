import { Link } from 'react-router';
import type { HomeData } from '../../shared/types.ts';
import { useApi } from '../lib/api.ts';
import { actions, useStore } from '../lib/store.ts';
import { AvailabilityBadge, ChannelCard, ErrorState, Img, Notices, Row, SkeletonGrid, TitleCard, titleHref } from '../components/ui.tsx';

function ContinueWatching() {
  const progress = useStore((s) => s.progress);
  const list = Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) return null;
  return (
    <Row title="Weiterschauen" subtitle="Nur direkt hier abgespielte Videos – lokal in deinem Browser gespeichert">
      {list.map((p) => (
        <div key={p.key} className="card continue">
          <Link to={p.href} className="card-poster">
            <Img src={p.posterUrl} fallback={p.title} />
            <div className="progress">
              <span style={{ width: `${Math.min(100, (p.position / p.duration) * 100)}%` }} />
            </div>
          </Link>
          <div className="card-body">
            <div className="card-title">{p.title}</div>
            <div className="card-sub">
              {p.subtitle ? `${p.subtitle} · ` : ''}
              noch {Math.max(1, Math.round((p.duration - p.position) / 60))} Min.
              <button className="link-btn" onClick={() => actions.removeProgress(p.key)} aria-label={`${p.title} aus Weiterschauen entfernen`}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </Row>
  );
}

export function HomePage() {
  const { data, error, loading, reload } = useApi<HomeData>('/home');
  const hero = data?.rows.find((r) => r.id === 'direct')?.items.find((i) => i.backdropUrl || i.posterUrl) ?? data?.rows[0]?.items.find((i) => i.backdropUrl);

  return (
    <div className="page">
      {hero ? (
        <section className="hero" style={{ ['--hero' as string]: `url("${hero.backdropUrl ?? hero.posterUrl}")` }}>
          <div className="hero-inner">
            <p className="eyebrow">Empfehlung</p>
            <h1>{hero.title}</h1>
            <div className="hero-meta">
              <AvailabilityBadge value={hero.availability} known={hero.availabilityKnown} />
              {hero.year && <span>{hero.year}</span>}
              {hero.genres.slice(0, 3).map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
            {hero.overview && <p className="hero-text">{hero.overview}</p>}
            <div className="hero-actions">
              <Link className="btn btn-primary" to={titleHref(hero.id)}>
                {hero.availability === 'direct' ? '▶ Jetzt ansehen' : 'Details & Optionen'}
              </Link>
              <Link className="btn btn-ghost" to="/live">
                📡 Live-TV
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="hero hero-plain">
          <div className="hero-inner">
            <p className="eyebrow">Willkommen bei</p>
            <h1>Rahim Cinema</h1>
            <p className="hero-text">Filme, Serien und Live-TV entdecken. Freigegebene Inhalte direkt ansehen, alles andere führt zum passenden Anbieter.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/live">📡 Live-TV öffnen</Link>
              <Link className="btn btn-ghost" to="/filme">Filme durchsuchen</Link>
            </div>
          </div>
        </section>
      )}

      <ContinueWatching />

      {loading && !data && <SkeletonGrid n={8} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Notices list={data.notices} />
          {data.channels.length > 0 && (
            <Row title="Live-TV jetzt" subtitle="Offizielle Streams der Sender – in deiner Region abspielbar" link="/live" wide>
              {data.channels.map((c) => (
                <ChannelCard key={c.id} ch={c} />
              ))}
            </Row>
          )}
          {data.rows.map((r) => (
            <Row key={r.id} title={r.title} subtitle={r.subtitle} link={r.link}>
              {r.items.map((i) => (
                <TitleCard key={i.id} item={i} />
              ))}
            </Row>
          ))}
          {data.rows.length === 0 && (
            <div className="state">
              <p>Momentan konnten keine Filme oder Serien geladen werden. Live-TV und die Merkliste funktionieren trotzdem.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
