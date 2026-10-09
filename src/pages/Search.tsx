import { Link, useSearchParams } from 'react-router';
import type { Channel, Paged, TitleSummary } from '../../shared/types.ts';
import { useApi } from '../lib/api.ts';
import { ChannelCard, Empty, ErrorState, Notices, SkeletonGrid, TitleCard } from '../components/ui.tsx';

function Section({ title, link, res }: { title: string; link: string; res: ReturnType<typeof useApi<Paged<TitleSummary>>> }) {
  return (
    <section className="search-section">
      <div className="row-head">
        <h2>{title}</h2>
        {res.data && res.data.items.length > 0 && (
          <Link className="row-link" to={link}>
            Alle Treffer →
          </Link>
        )}
      </div>
      {res.loading && !res.data && <SkeletonGrid n={6} />}
      {res.error && <ErrorState message={res.error.message} onRetry={res.reload} />}
      {res.data && <Notices list={res.data.notices.filter((n) => n.level !== 'info')} />}
      {res.data && res.data.items.length === 0 && <p className="muted">Keine Treffer.</p>}
      {res.data && res.data.items.length > 0 && (
        <div className="grid">
          {res.data.items.slice(0, 12).map((i) => (
            <TitleCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </section>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const movies = useApi<Paged<TitleSummary>>(q ? '/catalog' : null, { kind: 'movie', q });
  const series = useApi<Paged<TitleSummary>>(q ? '/catalog' : null, { kind: 'series', q });
  const channels = useApi<Paged<Channel>>(q ? '/live/channels' : null, { q, playable: '0' });

  if (!q) return <div className="page page-pad"><Empty title="Gib oben einen Suchbegriff ein." /></div>;

  return (
    <div className="page page-pad">
      <h1>Suche: „{q}“</h1>
      <Section title="Filme" link={`/filme?q=${encodeURIComponent(q)}`} res={movies} />
      <Section title="Serien" link={`/serien?q=${encodeURIComponent(q)}`} res={series} />
      <section className="search-section">
        <div className="row-head">
          <h2>Live-TV-Sender</h2>
          <Link className="row-link" to={`/live?q=${encodeURIComponent(q)}&playable=0`}>
            Alle Treffer →
          </Link>
        </div>
        {channels.loading && !channels.data && <SkeletonGrid n={4} />}
        {channels.error && <ErrorState message={channels.error.message} onRetry={channels.reload} />}
        {channels.data && channels.data.items.length === 0 && <p className="muted">Keine Sender gefunden.</p>}
        {channels.data && (
          <div className="channel-grid">
            {channels.data.items.slice(0, 12).map((c) => (
              <ChannelCard key={c.id} ch={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
