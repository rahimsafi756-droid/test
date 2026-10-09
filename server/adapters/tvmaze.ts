/**
 * TVmaze-Adapter – Serienkatalog ohne API-Schlüssel (Fallback, wenn kein TMDB-Schlüssel gesetzt ist).
 * Doku: https://www.tvmaze.com/api – Daten unter CC BY-SA, Quellenangabe nötig.
 * Bei HTTP 429 wird automatisch kurz gewartet (siehe lib/http.ts).
 */
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson, limitConcurrency } from '../lib/http.ts';
import type { Episode, SeasonDetail, SeasonSummary, SortKey, TitleSummary } from '../../shared/types.ts';
import { genreByKey, normalizeGenres } from '../../shared/genres.ts';

const API = 'https://api.tvmaze.com';
const HOUR = 3600_000;
const limit = limitConcurrency(2);

export const tvmazeInfo = {
  id: 'tvmaze' as const,
  name: 'TVmaze',
  purpose: 'Serien, Staffeln und Episoden ohne API-Schlüssel (Fallback)',
  keyRequired: false,
};

export const tvmazeEnabled = () => config.isEnabled('tvmaze');

const show = z.object({
  id: z.number(),
  name: z.string(),
  language: z.string().nullish(),
  genres: z.array(z.string()).default([]),
  premiered: z.string().nullish(),
  runtime: z.number().nullish(),
  averageRuntime: z.number().nullish(),
  rating: z.object({ average: z.number().nullish() }).nullish(),
  weight: z.number().nullish(),
  image: z.object({ medium: z.string().nullish(), original: z.string().nullish() }).nullish(),
  summary: z.string().nullish(),
  officialSite: z.string().nullish(),
  url: z.string().optional(),
  network: z.object({ name: z.string() }).nullish(),
  webChannel: z.object({ name: z.string(), officialSite: z.string().nullish() }).nullish(),
});
const seasonList = z.array(
  z.object({ id: z.number(), number: z.number(), name: z.string().nullish(), episodeOrder: z.number().nullish(), premiereDate: z.string().nullish(), image: z.object({ medium: z.string().nullish() }).nullish() }),
);
const castList = z.array(z.object({ person: z.object({ name: z.string(), image: z.object({ medium: z.string().nullish() }).nullish() }), character: z.object({ name: z.string() }).nullish() }));
const showDetail = show.extend({ _embedded: z.object({ seasons: seasonList.optional(), cast: castList.optional() }).optional() });
const episodes = z.array(
  z.object({
    id: z.number(),
    season: z.number(),
    number: z.number().nullish(),
    name: z.string(),
    airdate: z.string().nullish(),
    runtime: z.number().nullish(),
    summary: z.string().nullish(),
    image: z.object({ medium: z.string().nullish() }).nullish(),
  }),
);

type Show = z.infer<typeof show>;

const LANG: Record<string, string> = { English: 'en', German: 'de', French: 'fr', Italian: 'it', Spanish: 'es', Japanese: 'ja', Korean: 'ko', Swedish: 'sv', Danish: 'da', Turkish: 'tr', Norwegian: 'no', Dutch: 'nl' };

/** HTML aus TVmaze-Zusammenfassungen entfernen (nur Text anzeigen). */
export function stripHtml(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const t = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t || undefined;
}

const https = (u: string | null | undefined) => (u ? u.replace(/^http:/, 'https:') : undefined);

export function mapShow(s: Show): TitleSummary {
  return {
    id: `tvmaze:series:${s.id}`,
    kind: 'series',
    title: s.name,
    year: s.premiered ? Number(s.premiered.slice(0, 4)) : undefined,
    overview: stripHtml(s.summary),
    posterUrl: https(s.image?.medium),
    backdropUrl: https(s.image?.original),
    genres: normalizeGenres(s.genres).length ? normalizeGenres(s.genres) : s.genres,
    originalLanguage: s.language ? LANG[s.language] : undefined,
    rating: s.rating?.average ?? undefined,
    // TVmaze liefert keine Anbieterdaten für die Schweiz → nichts behaupten
    availability: 'none',
    availabilityKnown: false,
    provider: 'tvmaze',
  };
}

const get = <T>(path: string, schema: z.ZodType<T>, ttl: number) =>
  cache.wrap(`tvmaze:${path}`, ttl, () => limit(() => fetchJson(API + path, { provider: 'tvmaze', schema })));

export interface TvmazeListParams {
  q?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  lang?: string;
  sort: SortKey;
  page: number;
}

const PAGE_SIZE = 40;

export async function tvmazeList(p: TvmazeListParams) {
  let shows: Show[];
  if (p.q) {
    const res = await get(`/search/shows?q=${encodeURIComponent(p.q)}`, z.array(z.object({ score: z.number(), show })), HOUR);
    shows = res.map((r) => r.show);
  } else {
    // Der Index ist nach ID sortiert (250 je Seite). Für "beliebt" werden die
    // ersten Indexseiten geladen und nach TVmaze-"weight" sortiert.
    const idx = await Promise.allSettled([0, 1, 2, 3].map((n) => get(`/shows?page=${n}`, z.array(show), 24 * HOUR)));
    const ok = idx.filter((r): r is PromiseFulfilledResult<Show[]> => r.status === 'fulfilled');
    // Nur wenn alle Seiten ausfallen, ist TVmaze wirklich nicht erreichbar
    if (!ok.length) throw (idx[0] as PromiseRejectedResult).reason;
    shows = ok.flatMap((r) => r.value);
  }
  const g = genreByKey(p.genre);
  let items = shows
    .filter((s) => !g || normalizeGenres(s.genres).includes(g.label))
    .map((s) => ({ s, m: mapShow(s) }))
    .filter(({ m }) => (!p.lang || m.originalLanguage === p.lang) && (!p.yearFrom || (m.year ?? 0) >= p.yearFrom) && (!p.yearTo || (m.year ?? 9999) <= p.yearTo));
  if (!p.q || p.sort !== 'popularity') {
    const cmp: Record<SortKey, (a: (typeof items)[0], b: (typeof items)[0]) => number> = {
      popularity: (a, b) => (b.s.weight ?? 0) - (a.s.weight ?? 0),
      newest: (a, b) => (b.m.year ?? 0) - (a.m.year ?? 0),
      oldest: (a, b) => (a.m.year ?? 9999) - (b.m.year ?? 9999),
      title: (a, b) => a.m.title.localeCompare(b.m.title, 'de'),
      rating: (a, b) => (b.m.rating ?? 0) - (a.m.rating ?? 0),
    };
    items = items.sort(cmp[p.sort]);
  }
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  return {
    items: items.slice((p.page - 1) * PAGE_SIZE, p.page * PAGE_SIZE).map((x) => x.m),
    page: p.page,
    totalPages,
    totalResults: items.length,
  };
}

export async function tvmazeDetail(id: number) {
  const d = await get(`/shows/${id}?embed[]=seasons&embed[]=cast`, showDetail, 6 * HOUR);
  const seasons: SeasonSummary[] = (d._embedded?.seasons ?? []).map((s) => ({
    number: s.number,
    name: s.name || `Staffel ${s.number}`,
    episodeCount: s.episodeOrder ?? undefined,
    airDate: s.premiereDate ?? undefined,
    posterUrl: https(s.image?.medium),
    ref: String(s.id),
  }));
  return {
    summary: mapShow(d),
    runtimeMin: d.averageRuntime ?? d.runtime ?? undefined,
    homepage: d.officialSite ?? d.webChannel?.officialSite ?? undefined,
    tvmazeUrl: d.url,
    network: d.network?.name ?? d.webChannel?.name,
    cast: (d._embedded?.cast ?? []).slice(0, 12).map((c) => ({ name: c.person.name, role: c.character?.name, photoUrl: https(c.person.image?.medium) })),
    seasons,
  };
}

export async function tvmazeSeason(showId: number, seasonNumber: number): Promise<SeasonDetail> {
  const det = await tvmazeDetail(showId);
  const s = det.seasons.find((x) => x.number === seasonNumber);
  if (!s?.ref) throw new Error('Staffel nicht gefunden');
  const eps = await get(`/seasons/${s.ref}/episodes`, episodes, 6 * HOUR);
  const list: Episode[] = eps
    .filter((e) => e.season === seasonNumber)
    .map((e, i) => ({
      id: `tvmaze:episode:${e.id}`,
      seasonNumber: e.season,
      // Specials haben bei TVmaze keine Nummer → fortlaufend nach Position
      episodeNumber: e.number ?? i + 1,
      title: e.name,
      overview: stripHtml(e.summary),
      airDate: e.airdate || undefined,
      runtimeMin: e.runtime ?? undefined,
      stillUrl: https(e.image?.medium),
      sources: [],
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  return { seriesId: `tvmaze:series:${showId}`, number: seasonNumber, name: s.name, episodes: list };
}
