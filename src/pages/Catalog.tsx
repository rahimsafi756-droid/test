import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { MediaKind, Paged, TitleSummary } from '../../shared/types.ts';
import { GENRES, LANGUAGES } from '../../shared/genres.ts';
import { api, ApiError, useApi } from '../lib/api.ts';
import { Empty, ErrorState, Notices, SkeletonGrid, TitleCard } from '../components/ui.tsx';

const SORTS = [
  { v: 'popularity', l: 'Beliebtheit' },
  { v: 'newest', l: 'Neueste zuerst' },
  { v: 'oldest', l: 'Älteste zuerst' },
  { v: 'title', l: 'Titel A–Z' },
  { v: 'rating', l: 'Bewertung' },
];

const AVAIL = [
  { v: 'all', l: 'Alle Titel' },
  { v: 'free', l: 'Nur kostenlos' },
  { v: 'direct', l: 'Nur direkt ansehen' },
];

export function CatalogPage({ kind }: { kind: MediaKind }) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [qInput, setQInput] = useState(get('q'));
  const filters = {
    kind,
    q: get('q') || undefined,
    genre: get('genre') || undefined,
    yearFrom: get('yearFrom') || undefined,
    yearTo: get('yearTo') || undefined,
    lang: get('lang') || undefined,
    avail: get('avail') || 'all',
    sort: get('sort') || 'popularity',
  };
  const { data, error, loading, reload } = useApi<Paged<TitleSummary>>('/catalog', filters);
  const [more, setMore] = useState<TitleSummary[]>([]);
  const [page, setPage] = useState(1);
  const [moreState, setMoreState] = useState<{ loading: boolean; error?: string }>({ loading: false });

  // Bei neuen Filtern zusätzliche Seiten verwerfen
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setMore([]);
    setPage(1);
  }, [filterKey]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const loadMore = async () => {
    setMoreState({ loading: true });
    try {
      const res = await api<Paged<TitleSummary>>('/catalog', { ...filters, page: page + 1 });
      setMore((m) => [...m, ...res.items]);
      setPage(page + 1);
      setMoreState({ loading: false });
    } catch (e) {
      setMoreState({ loading: false, error: e instanceof ApiError ? e.message : 'Fehler beim Nachladen' });
    }
  };

  const items = data ? [...data.items, ...more].filter((it, i, arr) => arr.findIndex((x) => x.id === it.id) === i) : [];
  const years = Array.from({ length: new Date().getFullYear() - 1894 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div className="page page-pad">
      <h1>{kind === 'movie' ? 'Filme' : 'Serien'}</h1>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', qInput.trim());
        }}
      >
        <input type="search" placeholder={kind === 'movie' ? 'Film suchen …' : 'Serie suchen …'} value={qInput} onChange={(e) => setQInput(e.target.value)} onBlur={() => set('q', qInput.trim())} aria-label="Titelsuche" maxLength={100} />
        <select value={filters.avail} onChange={(e) => set('avail', e.target.value === 'all' ? '' : e.target.value)} aria-label="Verfügbarkeit">
          {AVAIL.map((a) => (
            <option key={a.v} value={a.v}>{a.l}</option>
          ))}
        </select>
        <select value={filters.genre ?? ''} onChange={(e) => set('genre', e.target.value)} aria-label="Genre">
          <option value="">Alle Genres</option>
          {GENRES.map((g) => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
        </select>
        <select value={filters.yearFrom ?? ''} onChange={(e) => set('yearFrom', e.target.value)} aria-label="Jahr von">
          <option value="">Jahr von</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={filters.yearTo ?? ''} onChange={(e) => set('yearTo', e.target.value)} aria-label="Jahr bis">
          <option value="">Jahr bis</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={filters.lang ?? ''} onChange={(e) => set('lang', e.target.value)} aria-label="Originalsprache">
          <option value="">Alle Sprachen</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => set('sort', e.target.value === 'popularity' ? '' : e.target.value)} aria-label="Sortierung">
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>{s.l}</option>
          ))}
        </select>
        {[...params.keys()].length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQInput('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Filter zurücksetzen
          </button>
        )}
      </form>

      {loading && !data && <SkeletonGrid />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Notices list={data.notices} />
          {typeof data.totalResults === 'number' && items.length > 0 && <p className="muted small">{data.totalResults.toLocaleString('de-CH')} Treffer</p>}
          {items.length === 0 ? (
            <Empty title="Keine Titel gefunden">
              <p className="muted">Ändere die Filter oder suche nach einem anderen Begriff.</p>
            </Empty>
          ) : (
            <div className={`grid${loading ? ' is-loading' : ''}`}>
              {items.map((i) => (
                <TitleCard key={i.id} item={i} />
              ))}
            </div>
          )}
          {page < data.totalPages && (
            <div className="center">
              {moreState.error && <p className="error-text">{moreState.error}</p>}
              <button className="btn" onClick={loadMore} disabled={moreState.loading}>
                {moreState.loading ? 'Lädt …' : 'Mehr laden'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
