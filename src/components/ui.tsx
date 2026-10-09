import { useState } from 'react';
import { Link } from 'react-router';
import type { Availability, Channel, Notice, TitleSummary } from '../../shared/types.ts';
import { AVAILABILITY_LABEL } from '../../shared/types.ts';
import { actions, useStore } from '../lib/store.ts';

export function AvailabilityBadge({ value, known = true, small }: { value: Availability; known?: boolean; small?: boolean }) {
  if (!known)
    return (
      <span className={`badge badge-unknown${small ? ' badge-sm' : ''}`} title="Verfügbarkeit konnte nicht ermittelt werden">
        Verfügbarkeit unbekannt
      </span>
    );
  return (
    <span className={`badge badge-${value}${small ? ' badge-sm' : ''}`} title={value === 'none' ? 'In den eingebundenen Quellen wurde für deine Region keine Wiedergabeoption gefunden' : undefined}>
      {value === 'direct' && '▶ '}
      {AVAILABILITY_LABEL[value]}
    </span>
  );
}

/** Bild mit Ersatzanzeige, falls es nicht geladen werden kann */
export function Img({ src, alt = '', fallback, className }: { src?: string; alt?: string; fallback: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="poster-fallback">{fallback}</div>;
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export const titleHref = (id: string) => `/titel/${encodeURIComponent(id)}`;

export function TitleCard({ item }: { item: TitleSummary }) {
  return (
    <Link to={titleHref(item.id)} className="card" aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}>
      <div className="card-poster">
        <Img src={item.posterUrl} fallback={item.title} />
        <div className="card-badge">
          <AvailabilityBadge value={item.availability} known={item.availabilityKnown} small />
        </div>
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-sub">
          {item.year ?? '–'} · {item.kind === 'movie' ? 'Film' : 'Serie'}
          {item.rating ? ` · ★ ${item.rating.toFixed(1)}` : ''}
        </div>
      </div>
    </Link>
  );
}

export function ChannelCard({ ch }: { ch: Channel }) {
  return (
    <Link to={`/live/${encodeURIComponent(ch.id)}`} className="channel-card">
      <div className="channel-logo">
        <Img src={ch.logoUrl} fallback={ch.name.slice(0, 2)} />
      </div>
      <div className="channel-info">
        <div className="card-title">{ch.name}</div>
        <div className="card-sub">
          {ch.countryFlag} {ch.countryName ?? ch.country}
        </div>
        <AvailabilityBadge value={ch.availability} small />
      </div>
    </Link>
  );
}

export function Row({ title, subtitle, link, wide, children }: { title: string; subtitle?: string; link?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className="row">
      <div className="row-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {link && (
          <Link to={link} className="row-link">
            Alle anzeigen →
          </Link>
        )}
      </div>
      <div className={`row-scroll${wide ? ' row-scroll-wide' : ''}`}>{children}</div>
    </section>
  );
}

export function Loading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function SkeletonGrid({ n = 12 }: { n?: number }) {
  return (
    <div className="grid" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card skeleton">
          <div className="card-poster" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-icon">⚠</p>
      <p>{message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state">
      <p className="state-icon">🎞</p>
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}

export function Notices({ list }: { list?: Notice[] }) {
  if (!list?.length) return null;
  return (
    <div className="notices">
      {list.map((n, i) => (
        <div key={`${n.code}-${i}`} className={`notice notice-${n.level}`} role={n.level === 'error' ? 'alert' : undefined}>
          {n.message}
        </div>
      ))}
    </div>
  );
}

export function WatchlistButton({ item }: { item: { id: string; kind: 'movie' | 'series' | 'channel'; title: string; posterUrl?: string; year?: number; href: string } }) {
  const saved = useStore((s) => s.watchlist.some((w) => w.id === item.id));
  return (
    <button className={`btn ${saved ? 'btn-active' : 'btn-ghost'}`} onClick={() => actions.toggleWatchlist(item)} aria-pressed={saved}>
      {saved ? '✓ Auf der Merkliste' : '+ Merkliste'}
    </button>
  );
}
