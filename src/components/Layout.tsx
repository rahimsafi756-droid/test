import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useStore } from '../lib/store.ts';

const NAV = [
  { to: '/', label: 'Start', icon: '⌂', end: true },
  { to: '/filme', label: 'Filme', icon: '🎬' },
  { to: '/serien', label: 'Serien', icon: '📺' },
  { to: '/live', label: 'Live-TV', icon: '📡' },
  { to: '/merkliste', label: 'Merkliste', icon: '★' },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const region = useStore((s) => s.settings.region);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) navigate(`/suche?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className="app">
      <a href="#main" className="skip-link">Zum Inhalt springen</a>
      <header className="topbar">
        <Link to="/" className="logo" aria-label="Rahim Cinema – Startseite">
          <span className="logo-mark">R</span>
          <span className="logo-text">
            Rahim <em>Cinema</em>
          </span>
        </Link>
        <nav className="topnav" aria-label="Hauptnavigation">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <form className="search" role="search" onSubmit={submit}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filme, Serien, Sender suchen …" aria-label="Suche" maxLength={100} />
        </form>
        <Link to="/einstellungen" className="region-chip" title="Region und Sprache ändern">
          {region} ⚙
        </Link>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <strong>Rahim Cinema</strong>
          <p className="muted">
            Nicht alle Filme und Serien sind kostenlos verfügbar. „Direkt ansehen“ erscheint nur bei geprüften, freigegebenen Quellen. Externe Angebote werden verlinkt, nicht abgespielt.
          </p>
        </div>
        <div className="footer-attr">
          <p className="muted small">
            Dieses Produkt nutzt die TMDB-API, ist aber nicht von TMDB unterstützt oder zertifiziert. Anbieterdaten: JustWatch. Weitere Quellen: YouTube (offizielle Kanäle), TVmaze (CC BY-SA), Wikidata/Wikimedia Commons, Internet Archive, iptv-org.
          </p>
          <Link to="/quellen">Quellen &amp; Lizenzen</Link> · <Link to="/einstellungen">Einstellungen</Link>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Navigation (mobil)">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span aria-hidden>{n.icon}</span>
            <small>{n.label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
