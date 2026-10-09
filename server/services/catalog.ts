import type {
  Availability,
  AvailabilityFilter,
  HomeData,
  HomeRow,
  MediaKind,
  Notice,
  Paged,
  PlaybackSource,
  SeasonDetail,
  SortKey,
  TitleDetail,
  TitleSummary,
  TrustMode,
} from '../../shared/types.ts';
import { genreByKey } from '../../shared/genres.ts';
import { regionAllowed, type FreeTitle } from '../adapters/free.ts';
import { archiveEnabled, archiveFreeTitles } from '../adapters/internetArchive.ts';
import { mapTmdbDetail, tmdbAvailabilityFor, tmdbConfigured, tmdbDetail, tmdbList, tmdbSeason } from '../adapters/tmdb.ts';
import { tvmazeDetail, tvmazeEnabled, tvmazeList, tvmazeSeason } from '../adapters/tvmaze.ts';
import { wikidataEnabled, wikidataFreeTitles } from '../adapters/wikidata.ts';
import { youtubeConfigured, youtubeFreeTitles } from '../adapters/youtube.ts';
import { UpstreamError } from '../lib/http.ts';
import { featuredChannels } from './live.ts';

export class NotFoundError extends Error {}

const FREE_NAMES: Record<string, string> = { wikidata: 'Wikidata/Wikimedia Commons', archive: 'Internet Archive', youtube: 'YouTube (offizieller Kanal)' };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- Freie Titel ----------

async function loadFree(notices: Notice[]): Promise<FreeTitle[]> {
  const jobs: Promise<FreeTitle[]>[] = [];
  if (wikidataEnabled())
    jobs.push(
      wikidataFreeTitles().catch((e) => {
        notices.push({ level: 'warning', code: 'wikidata_down', message: `Wikidata/Commons nicht erreichbar (${errText(e)}). Freie Filme daraus fehlen vorübergehend.` });
        return [];
      }),
    );
  if (youtubeConfigured())
    jobs.push(
      youtubeFreeTitles().then(
        (r) => {
          for (const e of r.errors) notices.push({ level: 'warning', code: 'youtube_channel', message: `YouTube-Kanal nicht verfügbar – ${e}` });
          return r.titles;
        },
        (e) => {
          notices.push({ level: 'warning', code: 'youtube_down', message: `YouTube-Filme gerade nicht verfügbar (${errText(e)}).` });
          return [];
        },
      ),
    );
  if (archiveEnabled())
    jobs.push(
      archiveFreeTitles().catch((e) => {
        notices.push({ level: 'warning', code: 'archive_down', message: `Internet Archive nicht erreichbar (${errText(e)}).` });
        return [];
      }),
    );
  const lists = await Promise.all(jobs);
  // Doppelte (gleiche TMDB-ID) entfernen, strukturierte Quellen bevorzugen
  const seen = new Set<number>();
  const out: FreeTitle[] = [];
  for (const t of lists.flat()) {
    if (t.tmdbId) {
      if (seen.has(t.tmdbId)) continue;
      seen.add(t.tmdbId);
    }
    out.push(t);
  }
  return out;
}

export function trustAllowed(t: FreeTitle, trust: TrustMode) {
  return trust === 'extended' || t.trust !== 'declared';
}

function freeAvailability(t: FreeTitle, region: string, trust: TrustMode): Availability {
  return trustAllowed(t, trust) && regionAllowed(t.regions, region, t.blockedRegions) ? 'direct' : 'none';
}

function freeSummary(t: FreeTitle, region: string, trust: TrustMode): TitleSummary {
  return { ...t.summary, availability: freeAvailability(t, region, trust), availabilityKnown: true };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function matchesFilters(t: TitleSummary, p: CatalogParams) {
  const g = genreByKey(p.genre);
  return (
    (!p.q || fold(`${t.title} ${t.originalTitle ?? ''}`).includes(fold(p.q))) &&
    (!g || t.genres.includes(g.label)) &&
    (!p.yearFrom || (t.year ?? 0) >= p.yearFrom) &&
    (!p.yearTo || (t.year ?? 9999) <= p.yearTo) &&
    (!p.lang || t.originalLanguage === p.lang)
  );
}

function sortLocal(items: TitleSummary[], sort: SortKey) {
  const byAvail = (a: TitleSummary, b: TitleSummary) => Number(b.availability === 'direct') - Number(a.availability === 'direct');
  const cmp: Record<SortKey, (a: TitleSummary, b: TitleSummary) => number> = {
    popularity: () => 0,
    newest: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    oldest: (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
    title: (a, b) => a.title.localeCompare(b.title, 'de'),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  };
  return [...items].sort((a, b) => byAvail(a, b) || cmp[sort](a, b));
}

// ---------- Katalog ----------

export interface CatalogParams {
  kind: MediaKind;
  q?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  lang?: string;
  avail: AvailabilityFilter;
  sort: SortKey;
  page: number;
  region: string;
  language: string;
  trust: TrustMode;
}

const LOCAL_PAGE = 40;

function paginate<T>(items: T[], page: number, notices: Notice[]): Paged<T> {
  return {
    items: items.slice((page - 1) * LOCAL_PAGE, page * LOCAL_PAGE),
    page,
    totalPages: Math.max(1, Math.ceil(items.length / LOCAL_PAGE)),
    totalResults: items.length,
    notices,
  };
}

/** Markiert TMDB-Titel als direkt abspielbar, wenn eine freie Quelle mit gleicher TMDB-ID existiert. */
function applyDirect(items: TitleSummary[], free: FreeTitle[], region: string, trust: TrustMode) {
  const byTmdb = new Map(free.filter((f) => f.tmdbId).map((f) => [f.tmdbId!, f]));
  for (const it of items) {
    const [prov, kind, id] = it.id.split(':');
    if (prov !== 'tmdb' || kind !== 'movie') continue;
    const f = byTmdb.get(Number(id));
    if (f && freeAvailability(f, region, trust) === 'direct') {
      it.availability = 'direct';
      it.availabilityKnown = true;
    }
  }
}

export async function listCatalog(p: CatalogParams): Promise<Paged<TitleSummary>> {
  const notices: Notice[] = [];
  const free = p.kind === 'movie' ? await loadFree(notices) : [];
  const freeItems = free.map((f) => freeSummary(f, p.region, p.trust)).filter((t) => matchesFilters(t, p));

  if (p.avail === 'direct') {
    if (p.kind === 'series') {
      notices.push({ level: 'info', code: 'no_direct_series', message: 'Die eingebundenen freien Quellen enthalten derzeit keine Serien mit direkt abspielbaren Episoden.' });
      return paginate([], p.page, notices);
    }
    return paginate(sortLocal(freeItems.filter((t) => t.availability === 'direct'), p.sort), p.page, notices);
  }

  if (tmdbConfigured()) {
    try {
      const res = await tmdbList({ ...p, freeOnly: p.avail === 'free' });
      await tmdbAvailabilityFor(res.items, p.region);
      applyDirect(res.items, free, p.region, p.trust);
      let items = res.items;
      if (p.page === 1 && p.kind === 'movie') {
        // Direkt abspielbare freie Titel auf Seite 1 voranstellen (ohne Duplikate)
        const tmdbIds = new Set(items.map((i) => i.id));
        const extra = freeItems
          .filter((t) => t.availability === 'direct' && !free.find((f) => f.summary.id === t.id && f.tmdbId && tmdbIds.has(`tmdb:movie:${f.tmdbId}`)))
          .slice(0, p.q ? 20 : 8);
        items = [...extra, ...items];
      }
      if (res.clientFiltered) notices.push({ level: 'info', code: 'search_filtered', message: 'Bei einer Textsuche werden Genre-, Jahres- und Sprachfilter auf die gefundenen Treffer angewendet.' });
      return { items, page: res.page, totalPages: res.totalPages, totalResults: res.totalResults, notices };
    } catch (e) {
      notices.push({ level: 'error', code: 'tmdb_error', message: `TMDB ist gerade nicht erreichbar (${errText(e)}). Angezeigt werden nur frei verfügbare Titel.` });
      return paginate(sortLocal(freeItems, p.sort), p.page, notices);
    }
  }

  notices.push({
    level: 'info',
    code: 'tmdb_missing',
    message:
      p.kind === 'movie'
        ? 'Kein TMDB-Schlüssel hinterlegt: Es werden nur frei verfügbare Filme angezeigt. Mit Schlüssel erscheint der vollständige Filmkatalog (siehe README).'
        : 'Kein TMDB-Schlüssel hinterlegt: Serien kommen von TVmaze. Anbieterinformationen für deine Region sind dort nicht enthalten.',
  });
  if (p.kind === 'movie') {
    const items = p.avail === 'free' ? freeItems.filter((t) => t.availability === 'direct') : freeItems;
    return paginate(sortLocal(items, p.sort), p.page, notices);
  }
  if (p.avail === 'free') {
    notices.push({ level: 'info', code: 'no_free_info', message: 'Ohne TMDB-Schlüssel kann nicht ermittelt werden, welche Serien kostenlos bei Anbietern laufen.' });
    return paginate([], p.page, notices);
  }
  if (!tvmazeEnabled()) return paginate([], p.page, notices);
  try {
    const res = await tvmazeList(p);
    return { ...res, notices };
  } catch (e) {
    notices.push({ level: 'error', code: 'tvmaze_error', message: `TVmaze ist gerade nicht erreichbar (${errText(e)}).` });
    return paginate([], p.page, notices);
  }
}

// ---------- Detail ----------

export function parseId(id: string): { provider: string; kind: string; ref: string } {
  const m = id.match(/^(tmdb|tvmaze|wikidata|archive|youtube):(movie|tv|series):([A-Za-z0-9._-]{1,120})$/);
  if (!m) throw new NotFoundError('Ungültige ID');
  return { provider: m[1], kind: m[2], ref: m[3] };
}

async function freeSourcesFor(f: FreeTitle, region: string, trust: TrustMode, notices: Notice[]): Promise<PlaybackSource[]> {
  try {
    const list = await f.loadSources();
    const allowedTrust = trustAllowed(f, trust);
    if (!allowedTrust)
      notices.push({ level: 'info', code: 'trust_strict', message: 'Die Lizenz dieser Quelle wurde nur vom Uploader erklärt. Im strengen Prüfmodus wird sie nicht abgespielt – in den Einstellungen kannst du den erweiterten Modus wählen.' });
    else if (!regionAllowed(f.regions, region, f.blockedRegions))
      notices.push({ level: 'info', code: 'region', message: f.regionNote ?? `Die Freigabe ist für die Region ${region} nicht belegt.` });
    if (!list.length) notices.push({ level: 'warning', code: 'no_file', message: 'Bei der Quelle wurde keine browsertaugliche Videodatei gefunden.' });
    return list.map((s) => ({ ...s, availableInRegion: allowedTrust && regionAllowed(s.regions, region, s.blockedRegions) }));
  } catch (e) {
    notices.push({ level: 'error', code: 'source_error', message: `Wiedergabequelle konnte nicht geladen werden (${errText(e)}).` });
    return [];
  }
}

function baseDetail(summary: TitleSummary, region: string): TitleDetail {
  return { ...summary, cast: [], directors: [], sources: [], trailers: [], offers: [], offersRegion: region, provenance: [], notices: [] };
}

export async function getTitle(id: string, region: string, language: string, trust: TrustMode): Promise<TitleDetail> {
  const { provider, kind, ref } = parseId(id);
  const now = new Date().toISOString();

  if (provider === 'tmdb') {
    if (!tmdbConfigured()) throw new NotFoundError('TMDB ist nicht konfiguriert');
    const mk: MediaKind = kind === 'movie' ? 'movie' : 'series';
    let d;
    try {
      d = await tmdbDetail(mk, Number(ref), language);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 404) throw new NotFoundError('Titel nicht gefunden');
      throw e;
    }
    const m = mapTmdbDetail(mk, d, region);
    const detail: TitleDetail = {
      ...baseDetail(m.summary, region),
      runtimeMin: m.runtimeMin,
      tagline: m.tagline,
      homepage: m.homepage,
      cast: m.cast,
      directors: m.directors,
      trailers: m.trailers,
      offers: m.offers,
      offersLink: m.offersLink,
      seasons: m.seasons,
      provenance: [{ provider: 'tmdb', name: 'TMDB (Anbieterdaten: JustWatch)', url: `https://www.themoviedb.org/${kind}/${ref}`, fetchedAt: now }],
    };
    if (mk === 'movie') {
      const free = await loadFree(detail.notices);
      const f = free.find((x) => x.tmdbId === Number(ref));
      if (f) {
        detail.sources = await freeSourcesFor(f, region, trust, detail.notices);
        detail.provenance.push({ provider: f.summary.provider, name: FREE_NAMES[f.summary.provider] ?? f.summary.provider, url: f.homepage, fetchedAt: now });
        if (detail.sources.some((s) => s.availableInRegion)) detail.availability = 'direct';
      }
    }
    if (!detail.offers.length && detail.availability !== 'direct')
      detail.notices.push({ level: 'info', code: 'no_offers', message: `Für die Region ${region} sind bei TMDB/JustWatch keine Anbieter eingetragen.` });
    return detail;
  }

  if (provider === 'tvmaze') {
    const d = await tvmazeDetail(Number(ref)).catch((e) => {
      if (e instanceof UpstreamError && e.status === 404) throw new NotFoundError('Serie nicht gefunden');
      throw e;
    });
    return {
      ...baseDetail(d.summary, region),
      runtimeMin: d.runtimeMin,
      homepage: d.homepage,
      cast: d.cast,
      seasons: d.seasons,
      provenance: [{ provider: 'tvmaze', name: 'TVmaze (CC BY-SA)', url: d.tvmazeUrl, fetchedAt: now }],
      notices: [
        {
          level: 'info',
          code: 'tvmaze_no_offers',
          message: `TVmaze enthält keine Anbieterdaten für ${region}.${d.network ? ` Ursprünglich ausgestrahlt bei: ${d.network}.` : ''} Mit einem TMDB-Schlüssel werden Anbieter angezeigt.`,
        },
      ],
    };
  }

  // wikidata / archive / youtube
  const notices: Notice[] = [];
  const free = await loadFree(notices);
  const f = free.find((x) => x.summary.id === id);
  if (!f) {
    if (notices.length) throw new UpstreamError(provider === 'archive' ? 'archive' : provider === 'youtube' ? 'youtube' : 'wikidata', notices.map((n) => n.message).join(' '));
    throw new NotFoundError('Titel nicht gefunden');
  }
  const detail: TitleDetail = {
    ...baseDetail(freeSummary(f, region, trust), region),
    runtimeMin: f.runtimeMin,
    directors: f.directors ?? [],
    homepage: f.homepage,
    notices,
    provenance: [{ provider: f.summary.provider, name: FREE_NAMES[f.summary.provider] ?? f.summary.provider, url: f.homepage, fetchedAt: now }],
  };
  detail.sources = await freeSourcesFor(f, region, trust, detail.notices);
  detail.availability = detail.sources.some((s) => s.availableInRegion) ? 'direct' : 'none';
  // Mit TMDB-Schlüssel: Metadaten ergänzen (Poster, Beschreibung, Besetzung, Trailer)
  if (f.tmdbId && tmdbConfigured()) {
    try {
      const m = mapTmdbDetail('movie', await tmdbDetail('movie', f.tmdbId, language), region);
      detail.posterUrl ??= m.summary.posterUrl;
      detail.backdropUrl ??= m.summary.backdropUrl;
      detail.overview = m.summary.overview ?? detail.overview;
      detail.genres = m.summary.genres.length ? m.summary.genres : detail.genres;
      detail.runtimeMin ??= m.runtimeMin;
      detail.cast = m.cast;
      if (m.directors.length) detail.directors = m.directors;
      detail.trailers = m.trailers;
      detail.offers = m.offers;
      detail.offersLink = m.offersLink;
      detail.provenance.push({ provider: 'tmdb', name: 'TMDB', url: `https://www.themoviedb.org/movie/${f.tmdbId}`, fetchedAt: now });
    } catch {
      /* Ergänzung optional */
    }
  }
  return detail;
}

export async function getSeason(id: string, season: number, language: string): Promise<SeasonDetail> {
  const { provider, ref } = parseId(id);
  if (provider === 'tmdb') return tmdbSeason(Number(ref), season, language);
  if (provider === 'tvmaze') return tvmazeSeason(Number(ref), season);
  throw new NotFoundError('Keine Staffeln für diesen Titel');
}

// ---------- Startseite ----------

export async function home(region: string, language: string, trust: TrustMode): Promise<HomeData> {
  const notices: Notice[] = [];
  const rows: HomeRow[] = [];
  const base = { region, language, trust, page: 1, sort: 'popularity' as SortKey, avail: 'all' as AvailabilityFilter };

  const [free, channels, popMovies, popSeries, freeProv] = await Promise.allSettled([
    listCatalog({ ...base, kind: 'movie', avail: 'direct' }),
    featuredChannels(region),
    tmdbConfigured() ? listCatalog({ ...base, kind: 'movie' }) : Promise.resolve(undefined),
    listCatalog({ ...base, kind: 'series' }),
    tmdbConfigured() ? listCatalog({ ...base, kind: 'movie', avail: 'free' }) : Promise.resolve(undefined),
  ]);

  const take = (r: PromiseSettledResult<Paged<TitleSummary> | undefined>) => {
    if (r.status === 'rejected') {
      notices.push({ level: 'error', code: 'home_row', message: errText(r.reason) });
      return [];
    }
    if (!r.value) return [];
    for (const n of r.value.notices) if (!notices.some((x) => x.code === n.code)) notices.push(n);
    return r.value.items;
  };

  const freeItems = take(free);
  rows.push({ id: 'direct', title: 'Direkt ansehen', subtitle: 'Gemeinfreie, frei lizenzierte und von Rechteinhabern freigegebene Filme – hier abspielbar', items: freeItems.slice(0, 20), link: '/filme?avail=direct' });
  const fp = take(freeProv).filter((t) => t.availability === 'free_provider');
  if (fp.length) rows.push({ id: 'free-provider', title: `Kostenlos bei Anbietern (${region})`, subtitle: 'Wird beim jeweiligen Anbieter abgespielt', items: fp.slice(0, 20), link: '/filme?avail=free' });
  const pm = take(popMovies);
  if (pm.length) rows.push({ id: 'popular-movies', title: 'Beliebte Filme', items: pm.filter((t) => t.provider === 'tmdb').slice(0, 20), link: '/filme' });
  const ps = take(popSeries);
  if (ps.length) rows.push({ id: 'popular-series', title: 'Beliebte Serien', items: ps.slice(0, 20), link: '/serien' });

  let ch: HomeData['channels'] = [];
  if (channels.status === 'fulfilled') ch = channels.value;
  else notices.push({ level: 'warning', code: 'live_down', message: `Live-TV-Daten nicht verfügbar (${errText(channels.reason)})` });
  return { rows: rows.filter((r) => r.items.length), channels: ch, notices };
}
