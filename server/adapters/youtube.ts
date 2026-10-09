/**
 * YouTube-Adapter: ganze Filme aus kuratierten offiziellen Kanälen
 * (server/data/youtube-channels.ts) über die YouTube Data API v3.
 * Doku: https://developers.google.com/youtube/v3
 *
 * Benötigt YOUTUBE_API_KEY (kostenlos, Tageskontingent 10 000 Einheiten).
 * Verbrauch je Aktualisierung: ca. 1 Einheit pro Kanal + 1 je 50 Videos
 * (channels.list, playlistItems.list, videos.list kosten je 1 Einheit).
 *
 * Geprüft wird pro Video: öffentlich, Einbettung erlaubt ("embeddable"),
 * kein Livestream, Mindestlaufzeit (ganzer Film statt Trailer) und
 * regionale Sperren (contentDetails.regionRestriction).
 * Wiedergabe ausschliesslich über den offiziellen YouTube-Einbettungsplayer.
 */
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import { YOUTUBE_CHANNELS, type YoutubeChannel } from '../data/youtube-channels.ts';
import { normalizeGenres } from '../../shared/genres.ts';
import type { FreeTitle } from './free.ts';

const API = 'https://www.googleapis.com/youtube/v3';
const HOUR = 3600_000;

export const youtubeInfo = {
  id: 'youtube' as const,
  name: 'YouTube (offizielle Kanäle)',
  purpose: 'Ganze Filme aus kuratierten offiziellen Kanälen von Rechteinhabern',
  keyRequired: true,
};

export const youtubeConfigured = () => config.isEnabled('youtube') && Boolean(config.youtubeApiKey);

const thumbs = z.record(z.string(), z.object({ url: z.string(), width: z.number().optional() })).optional();

const channelsSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), snippet: z.object({ title: z.string() }).optional(), contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }) }))
    .default([]),
});
const playlistSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }) })).default([]),
});
const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          description: z.string().optional(),
          publishedAt: z.string().optional(),
          channelId: z.string(),
          tags: z.array(z.string()).optional(),
          defaultAudioLanguage: z.string().optional(),
          defaultLanguage: z.string().optional(),
          liveBroadcastContent: z.string().optional(),
          thumbnails: thumbs,
        }),
        contentDetails: z.object({
          duration: z.string(),
          regionRestriction: z.object({ allowed: z.array(z.string()).optional(), blocked: z.array(z.string()).optional() }).optional(),
        }),
        status: z.object({ embeddable: z.boolean().optional(), privacyStatus: z.string().optional(), uploadStatus: z.string().optional() }),
      }),
    )
    .default([]),
});

type Video = z.infer<typeof videosSchema>['items'][number];

const api = <T>(path: string, params: Record<string, string>, schema: z.ZodType<T>) => {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', config.youtubeApiKey ?? '');
  return fetchJson(u.toString(), { provider: 'youtube', schema });
};

/** ISO-8601-Dauer (PT1H32M10S) → Minuten */
export function isoDurationMinutes(d: string): number {
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, days, h, min, s] = m.map((x) => Number(x ?? 0));
  return days * 1440 + h * 60 + min + s / 60;
}

/** Entfernt typische Zusätze wie "(Ganzer Film Deutsch)", "| Full Movie", "[HD]". */
export function cleanFilmTitle(raw: string): { title: string; year?: number } {
  const year = raw.match(/\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})\b(?=[^\d]*$)/);
  let t = raw
    .replace(/\s*[([](?:ganzer|kompletter|full|film completo|in voller länge)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[|–—-]\s*(?:ganzer film|full movie|film completo|kompletter film|in voller länge|hd|4k|deutsch|german|english|italiano).*$/i, '')
    .replace(/\s*[([](?:hd|4k|uhd|deutsch|german|english|italiano|en|de|it)[)\]]/gi, '')
    .replace(/\s*[([](19\d{2}|20\d{2})[)\]]/g, '')
    .replace(/\s*[|–—-]\s*blender open movie.*$/i, '')
    .trim();
  if (!t) t = raw.trim();
  const y = year ? Number(year[1] ?? year[2]) : undefined;
  return { title: t, year: y && y <= new Date().getFullYear() ? y : undefined };
}

/** Prüft ein Video gegen die Kanalregeln. Exportiert für Tests. */
export function acceptVideo(v: Video, ch: YoutubeChannel): boolean {
  if (v.status.embeddable !== true) return false;
  if (v.status.privacyStatus && v.status.privacyStatus !== 'public') return false;
  if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') return false;
  if (isoDurationMinutes(v.contentDetails.duration) < ch.minMinutes) return false;
  if (ch.titleInclude && !ch.titleInclude.test(v.snippet.title)) return false;
  if (ch.titleExclude?.test(v.snippet.title)) return false;
  return true;
}

async function uploadsPlaylist(ch: YoutubeChannel): Promise<string | undefined> {
  const params: Record<string, string> = { part: 'contentDetails,snippet' };
  if (ch.channelId) params.id = ch.channelId;
  else if (ch.handle) params.forHandle = ch.handle;
  else return undefined;
  const res = await cache.wrap(`yt:ch:${ch.key}`, 7 * 24 * HOUR, () => api('/channels', params, channelsSchema));
  return res.items[0]?.contentDetails.relatedPlaylists.uploads;
}

const MAX_PAGES = 4; // 4 × 50 = die 200 neuesten Uploads je Kanal

async function channelVideos(ch: YoutubeChannel): Promise<Video[]> {
  const uploads = await uploadsPlaylist(ch);
  if (!uploads) throw new Error(`Kanal ${ch.name} nicht gefunden`);
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await api('/playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '50', ...(pageToken ? { pageToken } : {}) }, playlistSchema);
    ids.push(...page.items.map((x) => x.contentDetails.videoId));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await api('/videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(',') }, videosSchema);
    out.push(...res.items);
  }
  return out;
}

const bestThumb = (t: z.infer<typeof thumbs>) => t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url;

function toFreeTitle(v: Video, ch: YoutubeChannel, checkedAt: string): FreeTitle {
  const { title, year } = cleanFilmTitle(v.snippet.title);
  const rr = v.contentDetails.regionRestriction;
  const regions = rr?.allowed ? rr.allowed : ('worldwide' as const);
  const blockedRegions = rr?.blocked;
  const regionNote = rr?.allowed
    ? `Nur in ${rr.allowed.length} Ländern freigegeben (YouTube-Angabe).`
    : rr?.blocked?.length
      ? `In ${rr.blocked.length} Ländern gesperrt (YouTube-Angabe).`
      : 'Keine regionale Sperre angegeben. YouTube kann trotzdem Sperren verhängen, die die API nicht meldet.';
  const license = { name: ch.licenseName, url: ch.evidence[0], basis: ch.licenseBasis, trust: 'curated' as const };
  const homepage = `https://www.youtube.com/watch?v=${v.id}`;
  const lang = (v.snippet.defaultAudioLanguage ?? v.snippet.defaultLanguage ?? ch.language)?.slice(0, 2);
  const minutes = Math.round(isoDurationMinutes(v.contentDetails.duration));
  return {
    summary: {
      id: `youtube:movie:${v.id}`,
      kind: 'movie',
      title,
      originalTitle: title !== v.snippet.title ? v.snippet.title : undefined,
      year,
      overview: v.snippet.description?.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 700) || undefined,
      posterUrl: bestThumb(v.snippet.thumbnails),
      backdropUrl: bestThumb(v.snippet.thumbnails),
      genres: normalizeGenres([...(v.snippet.tags ?? []), v.snippet.title]),
      originalLanguage: lang,
      provider: 'youtube',
    },
    trust: 'curated',
    license,
    regions,
    blockedRegions,
    regionNote,
    homepage,
    runtimeMin: minutes || undefined,
    loadSources: async () => [
      {
        id: `yt-film:${v.id}`,
        kind: 'youtube',
        url: `https://www.youtube-nocookie.com/embed/${v.id}`,
        label: `Ganzer Film auf YouTube · ${ch.name}`,
        isTrailer: false,
        provider: 'youtube',
        providerName: `YouTube – ${ch.name} (${ch.operator})`,
        regions,
        blockedRegions,
        regionNote,
        license,
        embed: 'allowed',
        embedNote: 'Der Kanal erlaubt die Einbettung (YouTube-Status „embeddable“). Wiedergabe über den offiziellen YouTube-Player, inkl. dessen Werbung.',
        homepage,
        checkedAt,
      },
    ],
  };
}

export interface YoutubeResult {
  titles: FreeTitle[];
  errors: string[];
}

/** Lädt alle Filme aller kuratierten Kanäle (12 h gecacht). Fehler je Kanal werden gesammelt. */
export async function youtubeFreeTitles(): Promise<YoutubeResult> {
  return cache.wrap('yt:all', 12 * HOUR, async () => {
    const checkedAt = new Date().toISOString();
    const results = await Promise.allSettled(YOUTUBE_CHANNELS.map(async (ch) => ({ ch, videos: await cache.wrap(`yt:videos:${ch.key}`, 12 * HOUR, () => channelVideos(ch)) })));
    const titles: FreeTitle[] = [];
    const errors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        errors.push(`${YOUTUBE_CHANNELS[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        return;
      }
      for (const v of r.value.videos) if (acceptVideo(v, r.value.ch)) titles.push(toFreeTitle(v, r.value.ch, checkedAt));
    });
    if (!titles.length && errors.length === YOUTUBE_CHANNELS.length) throw new Error(errors.join('; '));
    return { titles, errors };
  });
}
