/**
 * TMDB-Adapter (The Movie Database, API v3).
 * Doku: https://developer.themoviedb.org/
 * Schlüssel bleibt ausschliesslich auf dem Server. Bilder kommen vom
 * öffentlichen Bild-CDN image.tmdb.org (kein Schlüssel nötig).
 * Anbieterdaten ("watch/providers") stammen von JustWatch – Quellenangabe Pflicht.
 */
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson, limitConcurrency } from '../lib/http.ts';
import type {
  Availability,
  CastMember,
  Episode,
  MediaKind,
  PlaybackSource,
  ProviderOffer,
  SeasonDetail,
  SeasonSummary,
  SortKey,
  TitleSummary,
} from '../../shared/types.ts';
import { AVAILABILITY_RANK } from '../../shared/types.ts';
import { genreByKey } from '../../shared/genres.ts';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const HOUR = 3600_000;
const limit = limitConcurrency(6);

export const tmdbInfo = {
  id: 'tmdb' as const,
  name: 'TMDB',
  purpose: 'Filme & Serien: Titel, Poster, Genres, Besetzung, Staffeln, Trailer, Anbieter (JustWatch)',
  keyRequired: true,
};

export function tmdbConfigured() {
  return config.isEnabled('tmdb') && Boolean(config.tmdbReadToken || config.tmdbApiKey);
}

/** UI-Sprache → TMDB-Sprache (de-CH hat bei TMDB kaum Übersetzungen) */
export function tmdbLanguage(lang: string): string {
  const map: Record<string, string> = { 'de-CH': 'de-DE', 'fr-CH': 'fr-FR', 'it-CH': 'it-IT' };
  return map[lang] ?? lang;
}

function url(path: string, params: Record<string, string | number | undefined>) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
  if (!config.tmdbReadToken && config.tmdbApiKey) u.searchParams.set('api_key', config.tmdbApiKey);
  return u.toString();
}

function headers(): Record<string, string> {
  return config.tmdbReadToken ? { Authorization: `Bearer ${config.tmdbReadToken}` } : {};
}

async function get<T>(path: string, params: Record<string, string | number | undefined>, schema: z.ZodType<T>, ttl = 6 * HOUR) {
  const u = url(path, params);
  // Cache-Schlüssel ohne Schlüssel/Token
  const key = `tmdb:${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()}`;
  return cache.wrap(key, ttl, () => limit(() => fetchJson(u, { provider: 'tmdb', schema, headers: headers() })));
}

// ---------- Schemas ----------
const listItem = z.object({
  id: z.number(),
  media_type: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  genre_ids: z.array(z.number()).optional(),
  original_language: z.string().nullish(),
  vote_average: z.number().nullish(),
  popularity: z.number().nullish(),
});
const pageSchema = z.object({
  page: z.number(),
  total_pages: z.number(),
  total_results: z.number(),
  results: z.array(listItem),
});
const genreList = z.object({ genres: z.array(z.object({ id: z.number(), name: z.string() })) });
const providerEntry = z.object({ provider_name: z.string(), logo_path: z.string().nullish(), display_priority: z.number().optional() });
const providerRegion = z.object({
  link: z.string().optional(),
  flatrate: z.array(providerEntry).optional(),
  free: z.array(providerEntry).optional(),
  ads: z.array(providerEntry).optional(),
  rent: z.array(providerEntry).optional(),
  buy: z.array(providerEntry).optional(),
});
const providersSchema = z.object({ results: z.record(z.string(), providerRegion) });
const video = z.object({ key: z.string(), site: z.string(), type: z.string(), name: z.string(), official: z.boolean().optional(), iso_639_1: z.string().nullish() });
const credits = z.object({
  cast: z.array(z.object({ name: z.string(), character: z.string().nullish(), profile_path: z.string().nullish() })).optional(),
  crew: z.array(z.object({ name: z.string(), job: z.string().nullish() })).optional(),
});
const detailSchema = listItem.extend({
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  runtime: z.number().nullish(),
  episode_run_time: z.array(z.number()).optional(),
  tagline: z.string().nullish(),
  homepage: z.string().nullish(),
  seasons: z
    .array(z.object({ season_number: z.number(), name: z.string(), episode_count: z.number().nullish(), air_date: z.string().nullish(), poster_path: z.string().nullish() }))
    .optional(),
  credits: credits.optional(),
  videos: z.object({ results: z.array(video) }).optional(),
  'watch/providers': providersSchema.optional(),
});
const seasonSchema = z.object({
  season_number: z.number(),
  name: z.string(),
  overview: z.string().nullish(),
  episodes: z.array(
    z.object({
      id: z.number(),
      episode_number: z.number(),
      season_number: z.number(),
      name: z.string(),
      overview: z.string().nullish(),
      air_date: z.string().nullish(),
      runtime: z.number().nullish(),
      still_path: z.string().nullish(),
    }),
  ),
});

type ListItem = z.infer<typeof listItem>;
export type TmdbDetail = z.infer<typeof detailSchema>;

// ---------- Mapping ----------
const img = (p: string | null | undefined, size: string) => (p ? `${IMG}/${size}${p}` : undefined);
const yearOf = (d: string | null | undefined) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined);

export function tmdbId(kind: MediaKind, id: number) {
  return `tmdb:${kind === 'movie' ? 'movie' : 'tv'}:${id}`;
}

async function genreNames(kind: MediaKind, language: string): Promise<Map<number, string>> {
  const data = await get(`/genre/${kind === 'movie' ? 'movie' : 'tv'}/list`, { language: tmdbLanguage(language) }, genreList, 24 * HOUR);
  return new Map(data.genres.map((g) => [g.id, g.name]));
}

function toSummary(kind: MediaKind, r: ListItem, genres: Map<number, string>): TitleSummary {
  return {
    id: tmdbId(kind, r.id),
    kind,
    title: (kind === 'movie' ? r.title : r.name) ?? r.original_title ?? r.original_name ?? 'Ohne Titel',
    originalTitle: r.original_title ?? r.original_name,
    year: yearOf(r.release_date ?? r.first_air_date),
    overview: r.overview || undefined,
    posterUrl: img(r.poster_path, 'w342'),
    backdropUrl: img(r.backdrop_path, 'w1280'),
    genres: (r.genre_ids ?? []).map((g) => genres.get(g)).filter((g): g is string => Boolean(g)),
    originalLanguage: r.original_language ?? undefined,
    rating: r.vote_average ?? undefined,
    availability: 'none',
    availabilityKnown: false,
    provider: 'tmdb',
  };
}

export interface TmdbListParams {
  kind: MediaKind;
  q?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  lang?: string;
  sort: SortKey;
  page: number;
  region: string;
  language: string;
  /** nur Titel mit kostenlosem Angebot (free/ads) in der Region */
  freeOnly?: boolean;
}

const SORT_MAP: Record<SortKey, { movie: string; tv: string }> = {
  popularity: { movie: 'popularity.desc', tv: 'popularity.desc' },
  newest: { movie: 'primary_release_date.desc', tv: 'first_air_date.desc' },
  oldest: { movie: 'primary_release_date.asc', tv: 'first_air_date.asc' },
  title: { movie: 'title.asc', tv: 'name.asc' },
  rating: { movie: 'vote_average.desc', tv: 'vote_average.desc' },
};

export async function tmdbList(p: TmdbListParams) {
  const kind = p.kind === 'movie' ? 'movie' : 'tv';
  const language = tmdbLanguage(p.language);
  const genres = await genreNames(p.kind, p.language);
  let data: z.infer<typeof pageSchema>;
  let clientFiltered = false;
  if (p.q) {
    // Die Suche unterstützt keine Genre-/Sprachfilter → werden danach angewendet.
    data = await get(`/search/${kind}`, {
      query: p.q,
      language,
      region: p.region,
      page: p.page,
      include_adult: 'false',
      ...(p.yearFrom && p.yearFrom === p.yearTo ? (kind === 'movie' ? { primary_release_year: p.yearFrom } : { first_air_date_year: p.yearFrom }) : {}),
    }, pageSchema, HOUR);
    clientFiltered = Boolean(p.genre || p.lang || p.yearFrom || p.yearTo);
  } else {
    const g = genreByKey(p.genre);
    const gid = g ? (p.kind === 'movie' ? g.tmdbMovie : g.tmdbTv) : undefined;
    const dateFrom = kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
    const dateTo = kind === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
    data = await get(`/discover/${kind}`, {
      language,
      region: kind === 'movie' ? p.region : undefined,
      watch_region: p.region,
      with_watch_monetization_types: p.freeOnly ? 'free|ads' : undefined,
      sort_by: SORT_MAP[p.sort][kind],
      'vote_count.gte': p.sort === 'rating' ? 200 : p.sort === 'title' ? 20 : undefined,
      with_genres: gid,
      with_original_language: p.lang,
      [dateFrom]: p.yearFrom ? `${p.yearFrom}-01-01` : undefined,
      [dateTo]: p.yearTo ? `${p.yearTo}-12-31` : undefined,
      include_adult: 'false',
      page: p.page,
    }, pageSchema, 3 * HOUR);
  }
  let results = data.results;
  if (clientFiltered) {
    const g = genreByKey(p.genre);
    const gid = g ? (p.kind === 'movie' ? g.tmdbMovie : g.tmdbTv) : undefined;
    results = results.filter((r) => {
      const year = yearOf(r.release_date ?? r.first_air_date);
      return (
        (!g || (gid !== undefined && (r.genre_ids ?? []).includes(gid))) &&
        (!p.lang || r.original_language === p.lang) &&
        (!p.yearFrom || (year ?? 0) >= p.yearFrom) &&
        (!p.yearTo || (year ?? 9999) <= p.yearTo)
      );
    });
  }
  const items = results.map((r) => toSummary(p.kind, r, genres));
  return {
    items,
    page: data.page,
    totalPages: Math.min(data.total_pages, 500), // TMDB liefert max. Seite 500
    totalResults: data.total_results,
    clientFiltered,
  };
}

/** Anbieter-Angebote für eine Region aus watch/providers ableiten. */
export function offersFrom(regionData: z.infer<typeof providerRegion> | undefined): { offers: ProviderOffer[]; best: Availability; link?: string } {
  if (!regionData) return { offers: [], best: 'none' };
  const offers: ProviderOffer[] = [];
  const add = (list: z.infer<typeof providerEntry>[] | undefined, availability: ProviderOffer['availability'], note?: string) => {
    for (const p of list ?? []) {
      if (offers.some((o) => o.providerName === p.provider_name && o.availability === availability)) continue;
      offers.push({ providerName: p.provider_name, logoUrl: img(p.logo_path, 'w92'), availability, note });
    }
  };
  add(regionData.free, 'free_provider');
  add(regionData.ads, 'free_provider', 'mit Werbung');
  add(regionData.flatrate, 'subscription');
  add(regionData.rent, 'buy_rent', 'Leihen');
  add(regionData.buy, 'buy_rent', 'Kaufen');
  const best = offers.reduce<Availability>((b, o) => (AVAILABILITY_RANK[o.availability] < AVAILABILITY_RANK[b] ? o.availability : b), 'none');
  return { offers, best, link: regionData.link };
}

/** Beste Verfügbarkeit je Titel einer Liste (parallel, begrenzt, gecacht). */
export async function tmdbAvailabilityFor(items: TitleSummary[], region: string): Promise<void> {
  await Promise.all(
    items.map(async (it) => {
      const [, k, id] = it.id.split(':');
      try {
        const data = await get(`/${k}/${id}/watch/providers`, {}, providersSchema, 12 * HOUR);
        it.availability = offersFrom(data.results[region]).best;
        it.availabilityKnown = true;
      } catch {
        it.availabilityKnown = false;
      }
    }),
  );
}

export async function tmdbDetail(kind: MediaKind, id: number, language: string) {
  const k = kind === 'movie' ? 'movie' : 'tv';
  const lang = tmdbLanguage(language);
  return get(`/${k}/${id}`, {
    language: lang,
    append_to_response: 'credits,videos,watch/providers',
    include_video_language: `${lang.slice(0, 2)},en,null`,
  }, detailSchema, 6 * HOUR);
}

export function mapTmdbDetail(kind: MediaKind, d: TmdbDetail, region: string) {
  const genresMap = new Map((d.genres ?? []).map((g) => [g.id, g.name]));
  const summary = toSummary(kind, { ...d, genre_ids: (d.genres ?? []).map((g) => g.id) }, genresMap);
  const cast: CastMember[] = (d.credits?.cast ?? []).slice(0, 12).map((c) => ({ name: c.name, role: c.character ?? undefined, photoUrl: img(c.profile_path, 'w185') }));
  const directors = (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name);
  const checkedAt = new Date().toISOString();
  const trailers: PlaybackSource[] = (d.videos?.results ?? [])
    .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser') && /^[A-Za-z0-9_-]{6,20}$/.test(v.key))
    .sort((a, b) => Number(b.official ?? false) - Number(a.official ?? false))
    .slice(0, 4)
    .map((v) => ({
      id: `yt:${v.key}`,
      kind: 'youtube',
      url: `https://www.youtube-nocookie.com/embed/${v.key}`,
      label: `${v.type === 'Teaser' ? 'Teaser' : 'Trailer'}: ${v.name}`,
      isTrailer: true,
      provider: 'tmdb',
      providerName: 'YouTube (via TMDB)',
      regions: 'worldwide',
      availableInRegion: true,
      embed: 'allowed',
      embedNote: 'Offizieller YouTube-Einbettungsplayer',
      homepage: `https://www.youtube.com/watch?v=${v.key}`,
      checkedAt,
    }));
  const { offers, best, link } = offersFrom(d['watch/providers']?.results[region]);
  const seasons: SeasonSummary[] | undefined =
    kind === 'series'
      ? (d.seasons ?? []).map((s) => ({
          number: s.season_number,
          name: s.name,
          episodeCount: s.episode_count ?? undefined,
          airDate: s.air_date ?? undefined,
          posterUrl: img(s.poster_path, 'w185'),
        }))
      : undefined;
  return {
    summary: { ...summary, availability: best, availabilityKnown: true },
    runtimeMin: d.runtime ?? d.episode_run_time?.[0] ?? undefined,
    tagline: d.tagline || undefined,
    homepage: d.homepage || undefined,
    cast,
    directors,
    trailers,
    offers,
    offersLink: link,
    seasons,
  };
}

export async function tmdbSeason(tvId: number, season: number, language: string): Promise<SeasonDetail> {
  const s = await get(`/tv/${tvId}/season/${season}`, { language: tmdbLanguage(language) }, seasonSchema, 6 * HOUR);
  const episodes: Episode[] = s.episodes
    .filter((e) => e.season_number === season)
    .sort((a, b) => a.episode_number - b.episode_number)
    .map((e) => ({
      id: `tmdb:episode:${e.id}`,
      seasonNumber: e.season_number,
      episodeNumber: e.episode_number,
      title: e.name,
      overview: e.overview || undefined,
      airDate: e.air_date ?? undefined,
      runtimeMin: e.runtime ?? undefined,
      stillUrl: img(e.still_path, 'w300'),
      sources: [],
    }));
  return { seriesId: tmdbId('series', tvId), number: s.season_number, name: s.name, overview: s.overview || undefined, episodes };
}
