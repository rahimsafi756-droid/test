/**
 * Internet-Archive-Adapter (Advanced Search + Metadata API).
 * Doku: https://archive.org/developers/
 *
 * Es werden nur Einträge aus konfigurierten Sammlungen (IA_COLLECTIONS) mit
 * gesetzter Lizenzangabe ("licenseurl" auf Creative Commons / Public Domain Mark)
 * übernommen. Diese Angabe stammt vom Uploader und ist KEIN unabhängiger
 * Rechtsnachweis → Vertrauensstufe "declared"; im strengen Modus nicht abspielbar.
 */
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import type { PlaybackSource } from '../../shared/types.ts';
import { normalizeGenres } from '../../shared/genres.ts';
import type { FreeTitle } from './free.ts';

const HOUR = 3600_000;

export const archiveInfo = {
  id: 'archive' as const,
  name: 'Internet Archive',
  purpose: 'Archivfilme mit Lizenzangabe des Uploaders (nur im erweiterten Modus abspielbar)',
  keyRequired: false,
};

export const archiveEnabled = () => config.isEnabled('archive') && config.iaCollections.length > 0;

const strOrArr = z.union([z.string(), z.array(z.string())]).optional();
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

const searchSchema = z.object({
  response: z.object({
    numFound: z.number(),
    docs: z.array(
      z.object({
        identifier: z.string(),
        title: strOrArr,
        year: z.union([z.string(), z.number()]).optional(),
        description: strOrArr,
        licenseurl: strOrArr,
        subject: strOrArr,
        language: strOrArr,
        runtime: strOrArr,
        creator: strOrArr,
      }),
    ),
  }),
});

const metaSchema = z.object({
  files: z.array(z.object({ name: z.string(), format: z.string().optional(), height: z.string().optional(), size: z.string().optional() })).optional(),
  metadata: z.object({ licenseurl: strOrArr }).passthrough().optional(),
});

/** Akzeptierte Lizenz-URLs → lesbarer Name. Exportiert für Tests. */
export function licenseFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const u = url.replace(/^http:/, 'https:').toLowerCase();
  if (u.includes('creativecommons.org/publicdomain/mark')) return 'Public Domain Mark';
  if (u.includes('creativecommons.org/publicdomain/zero')) return 'CC0';
  const m = u.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  return undefined;
}

const LANG: Record<string, string> = { english: 'en', eng: 'en', german: 'de', deutsch: 'de', ger: 'de', french: 'fr', fre: 'fr', italian: 'it', ita: 'it', spanish: 'es', spa: 'es' };

function cleanText(s: string | undefined) {
  if (!s) return undefined;
  return s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800) || undefined;
}

const id = (s: string) => /^[A-Za-z0-9._-]+$/.test(s);

/** Bevorzugte Videoformate (browsertauglich, MP4/H.264) */
const FORMAT_RANK = ['h.264', 'h.264 ia', 'mpeg4', '512kb mpeg4'];

async function archiveSources(identifier: string, base: Omit<PlaybackSource, 'id' | 'kind' | 'url' | 'label' | 'mimeType' | 'quality' | 'availableInRegion' | 'subtitles'>): Promise<Omit<PlaybackSource, 'availableInRegion'>[]> {
  const meta = await cache.wrap(`ia:meta:${identifier}`, 12 * HOUR, () => fetchJson(`https://archive.org/metadata/${identifier}`, { provider: 'archive', schema: metaSchema }));
  const files = meta.files ?? [];
  const videos = files
    .filter((f) => f.name.toLowerCase().endsWith('.mp4') && FORMAT_RANK.includes((f.format ?? '').toLowerCase()))
    .sort((a, b) => FORMAT_RANK.indexOf((a.format ?? '').toLowerCase()) - FORMAT_RANK.indexOf((b.format ?? '').toLowerCase()));
  const subtitles = files
    .filter((f) => f.name.toLowerCase().endsWith('.vtt'))
    .map((f) => ({ label: f.name.replace(/\.vtt$/i, ''), lang: (f.name.match(/\.([a-z]{2})\.vtt$/i)?.[1] ?? 'und').toLowerCase(), url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}` }));
  return videos.slice(0, 2).map((f, i) => ({
    ...base,
    id: `ia:${identifier}:${i}`,
    kind: 'file',
    url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
    mimeType: 'video/mp4',
    label: `Internet Archive – ${f.format ?? 'MP4'}`,
    quality: f.height ? `${f.height}p` : undefined,
    subtitles: subtitles.length ? subtitles : undefined,
  }));
}

export async function archiveFreeTitles(): Promise<FreeTitle[]> {
  return cache.wrap('ia:search', 12 * HOUR, async () => {
    const collections = config.iaCollections.map((c) => `collection:${c}`).join(' OR ');
    const q = `mediatype:movies AND (${collections}) AND licenseurl:[* TO *]`;
    const u = new URL('https://archive.org/advancedsearch.php');
    u.searchParams.set('q', q);
    for (const f of ['identifier', 'title', 'year', 'description', 'licenseurl', 'subject', 'language', 'runtime', 'creator']) u.searchParams.append('fl[]', f);
    u.searchParams.append('sort[]', 'downloads desc');
    u.searchParams.set('rows', '300');
    u.searchParams.set('page', '1');
    u.searchParams.set('output', 'json');
    const data = await fetchJson(u.toString(), { provider: 'archive', schema: searchSchema, timeoutMs: 15_000 });
    const checkedAt = new Date().toISOString();
    const out: FreeTitle[] = [];
    for (const d of data.response.docs) {
      const licenseName = licenseFromUrl(first(d.licenseurl));
      if (!licenseName || !id(d.identifier)) continue;
      const homepage = `https://archive.org/details/${d.identifier}`;
      const license = {
        name: licenseName,
        url: first(d.licenseurl),
        basis: 'Lizenzangabe des Uploaders im Internet Archive – nicht unabhängig geprüft',
        trust: 'declared' as const,
      };
      const isPdMark = licenseName === 'Public Domain Mark';
      const regionNote = isPdMark
        ? 'Gemeinfreiheit wurde vom Uploader erklärt; ob sie in deiner Region gilt, ist nicht geprüft.'
        : 'Creative-Commons-Lizenz laut Uploader.';
      const subjects = all(d.subject).flatMap((s) => s.split(/[;,]/));
      const runtime = first(d.runtime);
      const mins = runtime ? runtime.split(':').map(Number) : [];
      out.push({
        summary: {
          id: `archive:movie:${d.identifier}`,
          kind: 'movie',
          title: first(d.title) ?? d.identifier,
          year: d.year ? Number(String(d.year).slice(0, 4)) || undefined : undefined,
          overview: cleanText(first(d.description)),
          posterUrl: `https://archive.org/services/img/${d.identifier}`,
          genres: normalizeGenres(subjects),
          originalLanguage: LANG[(first(d.language) ?? '').toLowerCase()],
          provider: 'archive',
        },
        trust: 'declared',
        license,
        regions: 'worldwide',
        regionNote,
        homepage,
        runtimeMin: mins.length === 3 ? mins[0] * 60 + mins[1] : mins.length === 2 ? mins[0] : undefined,
        directors: all(d.creator).slice(0, 2),
        loadSources: () =>
          archiveSources(d.identifier, {
            isTrailer: false,
            provider: 'archive',
            providerName: 'Internet Archive',
            regions: 'worldwide',
            regionNote,
            license,
            embed: 'unclear',
            embedNote: 'Lizenz laut Uploader; das Internet Archive erlaubt die Einbettung technisch, die Rechte sind aber nicht unabhängig belegt.',
            homepage,
            checkedAt,
          }),
      });
    }
    return out;
  });
}
