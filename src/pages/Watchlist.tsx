import { Link } from 'react-router';
import type { SavedItem } from '../lib/store.ts';
import { actions, useStore } from '../lib/store.ts';
import { Empty, Img } from '../components/ui.tsx';

const kindLabel = { movie: 'Film', series: 'Serie', channel: 'Sender' } as const;

function SavedGrid({ items, onRemove }: { items: SavedItem[]; onRemove?: (i: SavedItem) => void }) {
  return (
    <div className="grid">
      {items.map((i) => (
        <div key={i.id} className="card">
          <Link to={i.href} className={`card-poster${i.kind === 'channel' ? ' card-poster-logo' : ''}`}>
            <Img src={i.posterUrl} fallback={i.title} />
          </Link>
          <div className="card-body">
            <Link to={i.href} className="card-title">
              {i.title}
            </Link>
            <div className="card-sub">
              {kindLabel[i.kind]}
              {i.year ? ` · ${i.year}` : ''}
              {onRemove && (
                <button className="link-btn" onClick={() => onRemove(i)} aria-label={`${i.title} entfernen`}>
                  Entfernen
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WatchlistPage() {
  const watchlist = useStore((s) => s.watchlist);
  const history = useStore((s) => s.history);
  return (
    <div className="page page-pad">
      <h1>Merkliste</h1>
      <p className="muted small">Wird nur lokal in diesem Browser gespeichert – kein Konto nötig.</p>
      {watchlist.length === 0 ? (
        <Empty title="Deine Merkliste ist leer">
          <p className="muted">Auf einer Detailseite „+ Merkliste“ wählen.</p>
        </Empty>
      ) : (
        <SavedGrid items={watchlist} onRemove={(i) => actions.toggleWatchlist(i)} />
      )}

      <div className="row-head" style={{ marginTop: '2.5rem' }}>
        <h2>Zuletzt angesehen</h2>
        {history.length > 0 && (
          <button className="btn btn-ghost" onClick={() => actions.clearHistory()}>
            Verlauf löschen
          </button>
        )}
      </div>
      {history.length === 0 ? <p className="muted">Noch nichts angesehen.</p> : <SavedGrid items={history} />}
    </div>
  );
}
