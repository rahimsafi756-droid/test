import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { config } from './config.ts';
import { archiveEnabled, archiveInfo } from './adapters/internetArchive.ts';
import { iptvEnabled, iptvInfo } from './adapters/iptvOrg.ts';
import { tmdbConfigured, tmdbInfo } from './adapters/tmdb.ts';
import { tvmazeEnabled, tvmazeInfo } from './adapters/tvmaze.ts';
import { wikidataEnabled, wikidataInfo } from './adapters/wikidata.ts';
import { youtubeConfigured, youtubeInfo } from './adapters/youtube.ts';
import { UpstreamError } from './lib/http.ts';
import { getStatus } from './lib/status.ts';
import { NotFoundError, getSeason, getTitle, home, listCatalog } from './services/catalog.ts';
import { getChannel, listChannels, liveMeta } from './services/live.ts';
import { GENRES } from '../shared/genres.ts';
import type { SourceStatus } from '../shared/types.ts';

export const app = new Hono();

// Content-Security-Policy: Medien/Manifeste von HTTPS-Quellen, YouTube-nocookie für Trailer.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameSrc: ['https://www.youtube-nocookie.com'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

// Einfache Ratenbegrenzung je IP für die API (schützt auch die TMDB-Quote)
const buckets = new Map<string, { tokens: number; at: number }>();
app.use('/api/*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: 60, at: now };
  b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 2);
  b.at = now;
  if (b.tokens < 1) {
    c.header('Retry-After', '5');
    return c.json({ error: 'Zu viele Anfragen – bitte kurz warten.' }, 429);
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 10_000) buckets.clear();
  await next();
});

// ---------- Validierung ----------
const region = z.string().regex(/^[A-Z]{2}$/).default('CH');
const language = z.enum(['de-CH', 'de-DE', 'fr-CH', 'it-CH', 'en-US']).default('de-CH');
const trust = z.enum(['strict', 'extended']).default('strict');
const year = z.coerce.number().int().min(1870).max(2100).optional();
const page = z.coerce.number().int().min(1).max(500).default(1);

const catalogQuery = z.object({
  kind: z.enum(['movie', 'series']),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  genre: z.string().max(30).optional().transform((v) => v || undefined),
  yearFrom: year,
  yearTo: year,
  lang: z.string().regex(/^[a-z]{2}$/).optional().or(z.literal('').transform(() => undefined)),
  avail: z.enum(['all', 'free', 'direct']).default('all'),
  sort: z.enum(['popularity', 'newest', 'oldest', 'title', 'rating']).default('popularity'),
  page,
  region,
  language,
  trust,
});

const liveQuery = z.object({
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  country: z.string().regex(/^[A-Z]{2}$/).optional().or(z.literal('').transform(() => undefined)),
  language: z.string().regex(/^[a-z]{3}$/).optional().or(z.literal('').transform(() => undefined)),
  category: z.string().regex(/^[a-z-]{2,30}$/).optional().or(z.literal('').transform(() => undefined)),
  playable: z.enum(['0', '1']).default('1').transform((v) => v === '1'),
  region,
  page,
});

function parse<T>(schema: z.ZodType<T>, c: Context): T {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

class ValidationError extends Error {}

app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: `Ungültige Eingabe – ${err.message}` }, 400);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof UpstreamError) return c.json({ error: `Datenquelle ${err.provider} nicht verfügbar: ${err.message}` }, 502);
  console.error(err);
  return c.json({ error: 'Interner Fehler' }, 500);
});

// Kurzes Browser-Caching für API-Antworten
const cacheFor = (c: Context, s: number) => c.header('Cache-Control', `public, max-age=${s}`);

// ---------- Routen ----------
app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/sources', (c) => {
  const list: SourceStatus[] = [
    { ...tmdbInfo, configured: tmdbConfigured(), enabled: config.isEnabled('tmdb') },
    { ...tvmazeInfo, configured: true, enabled: tvmazeEnabled() },
    { ...wikidataInfo, configured: true, enabled: wikidataEnabled() },
    { ...archiveInfo, configured: true, enabled: archiveEnabled() },
    { ...youtubeInfo, configured: youtubeConfigured(), enabled: config.isEnabled('youtube') },
    { ...iptvInfo, configured: true, enabled: iptvEnabled() },
  ].map((s) => ({ ...s, ...getStatus(s.id) }));
  return c.json(list);
});

app.get('/api/genres', (c) => c.json(GENRES.map((g) => ({ key: g.key, label: g.label }))));

app.get('/api/home', async (c) => {
  const q = parse(z.object({ region, language, trust }), c);
  cacheFor(c, 120);
  return c.json(await home(q.region, q.language, q.trust));
});

app.get('/api/catalog', async (c) => {
  const q = parse(catalogQuery, c);
  cacheFor(c, 120);
  return c.json(await listCatalog(q));
});

app.get('/api/title/:id', async (c) => {
  const q = parse(z.object({ region, language, trust }), c);
  cacheFor(c, 120);
  return c.json(await getTitle(c.req.param('id'), q.region, q.language, q.trust));
});

app.get('/api/title/:id/season/:n', async (c) => {
  const q = parse(z.object({ language }), c);
  const n = z.coerce.number().int().min(0).max(200).safeParse(c.req.param('n'));
  if (!n.success) throw new ValidationError('Staffelnummer');
  cacheFor(c, 300);
  return c.json(await getSeason(c.req.param('id'), n.data, q.language));
});

app.get('/api/live/meta', async (c) => {
  if (!iptvEnabled()) throw new NotFoundError('Live-TV ist deaktiviert');
  cacheFor(c, 600);
  return c.json(await liveMeta());
});

app.get('/api/live/channels', async (c) => {
  if (!iptvEnabled()) throw new NotFoundError('Live-TV ist deaktiviert');
  const q = parse(liveQuery, c);
  cacheFor(c, 300);
  return c.json(await listChannels({ ...q, pageSize: 48 }));
});

app.get('/api/live/channel/:id', async (c) => {
  const q = parse(z.object({ region }), c);
  const id = c.req.param('id');
  if (!/^[A-Za-z0-9.&+_-]{1,80}$/.test(id)) throw new ValidationError('Sender-ID');
  const ch = await getChannel(id, q.region);
  if (!ch) throw new NotFoundError('Sender nicht gefunden');
  return c.json(ch);
});

app.all('/api/*', (c) => c.json({ error: 'Unbekannter API-Pfad' }, 404));
