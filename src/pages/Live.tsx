import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Channel, LiveMeta, Paged } from '../../shared/types.ts';
import { api, ApiError, useApi } from '../lib/api.ts';
import { ChannelCard, Empty, ErrorState, Notices, SkeletonGrid } from '../components/ui.tsx';

export function LivePage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [qInput, setQInput] = useState(get('q'));
  const filters = {
    q: get('q') || undefined,
    country: get('country') || undefined,
    language: get('language') || undefined,
    category: get('category') || undefined,
    playable: get('playable') || '1',
  };
  const meta = useApi<LiveMeta>('/live/meta');
  const { data, error, loading, reload } = useApi<Paged<Channel>>('/live/channels', filters);
  const [more, setMore] = useState<Channel[]>([]);
  const [page, setPage] = useState(1);
  const [moreErr, setMoreErr] = useState<string>();
  const key = JSON.stringify(filters);
  useEffect(() => {
    setMore([]);
    setPage(1);
  }, [key]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const loadMore = async () => {
    try {
      const res = await api<Paged<Channel>>('/live/channels', { ...filters, page: page + 1 });
      setMore((m) => [...m, ...res.items]);
      setPage(page + 1);
    } catch (e) {
      setMoreErr(e instanceof ApiError ? e.message : 'Fehler');
    }
  };

  const items = data ? [...data.items, ...more] : [];

  return (
    <div className="page page-pad">
      <h1>Live-TV</h1>
      <p className="muted lead">
        Abspielbar sind nur Streams, die über die offizielle Infrastruktur des jeweiligen Senders laufen. Alle anderen Sender aus dem iptv-org-Verzeichnis werden mit einem Link zur Website angezeigt. Ein Fernsehprogramm (EPG) ist nicht eingebunden.
      </p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', qInput.trim());
        }}
      >
        <input type="search" placeholder="Sender suchen …" value={qInput} onChange={(e) => setQInput(e.target.value)} onBlur={() => set('q', qInput.trim())} aria-label="Sender suchen" maxLength={100} />
        <select value={filters.playable} onChange={(e) => set('playable', e.target.value === '1' ? '' : e.target.value)} aria-label="Abspielbarkeit">
          <option value="1">Nur abspielbare Sender</option>
          <option value="0">Alle Sender (Verzeichnis)</option>
        </select>
        <select value={filters.country ?? ''} onChange={(e) => set('country', e.target.value)} aria-label="Land">
          <option value="">Alle Länder</option>
          {meta.data?.countries.map((c) => (
            <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
          ))}
        </select>
        <select value={filters.language ?? ''} onChange={(e) => set('language', e.target.value)} aria-label="Sprache">
          <option value="">Alle Sprachen</option>
          {meta.data?.languages.map((c) => (
            <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
          ))}
        </select>
        <select value={filters.category ?? ''} onChange={(e) => set('category', e.target.value)} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {meta.data?.categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
          ))}
        </select>
      </form>
      {meta.error && <ErrorState message={`Filterdaten nicht verfügbar: ${meta.error.message}`} onRetry={meta.reload} />}
      {loading && !data && <SkeletonGrid n={8} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Notices list={data.notices} />
          {typeof data.totalResults === 'number' && <p className="muted small">{data.totalResults} Sender</p>}
          {items.length === 0 ? (
            <Empty title="Keine Sender gefunden">
              {filters.playable === '1' && (
                <button className="btn" onClick={() => set('playable', '0')}>
                  Auch nicht abspielbare Sender zeigen
                </button>
              )}
            </Empty>
          ) : (
            <div className="channel-grid">
              {items.map((c) => (
                <ChannelCard key={c.id} ch={c} />
              ))}
            </div>
          )}
          {page < data.totalPages && (
            <div className="center">
              {moreErr && <p className="error-text">{moreErr}</p>}
              <button className="btn" onClick={loadMore}>
                Mehr laden
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
