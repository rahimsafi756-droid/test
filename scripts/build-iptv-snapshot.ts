/**
 * Erzeugt server/data/iptv-snapshot.json – einen kleinen Offline-Abzug der
 * iptv-org-Daten für ausgewählte Länder. Wird nur verwendet, wenn die
 * iptv-org-API (https://iptv-org.github.io/api) nicht erreichbar ist.
 *
 * Quelle: Rohdaten aus den GitHub-Repositories iptv-org/database (CSV) und
 * iptv-org/iptv (M3U je Land). Lizenz der Daten: Unlicense.
 *
 * Aufruf: npm run snapshot:iptv
 */
import { writeFileSync } from 'node:fs';
import { OFFICIAL_STREAM_RULES } from '../server/data/official-streams.ts';

const DB = 'https://raw.githubusercontent.com/iptv-org/database/master/data';
const STREAMS = 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams';
const COUNTRIES = ['ch', 'de', 'at', 'li', 'fr', 'it'];
const EXTRA_STREAM_FILES = ['qa'];

/** Minimaler CSV-Parser (RFC 4180: Anführungszeichen, Kommas, Zeilenumbrüche) */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const list = (s: string) => (s ? s.split(';').filter(Boolean) : []);
const bool = (s: string) => s.toUpperCase() === 'TRUE';

async function text(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function parseM3u(m3u: string) {
  const out: { channel: string | null; feed: string | null; title: string; url: string; referrer: string | null; user_agent: string | null; quality: string | null; labels: string[] }[] = [];
  let cur: { tvg?: string; title: string; ua?: string; ref?: string } | null = null;
  for (const line of m3u.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF')) {
      const tvg = line.match(/tvg-id="([^"]*)"/)?.[1];
      cur = { tvg, title: line.split(',').slice(1).join(',').trim() };
    } else if (line.startsWith('#EXTVLCOPT:http-user-agent=') && cur) cur.ua = line.split('=').slice(1).join('=');
    else if (line.startsWith('#EXTVLCOPT:http-referrer=') && cur) cur.ref = line.split('=').slice(1).join('=');
    else if (cur && /^https?:\/\//.test(line.trim())) {
      const [channel, feed] = (cur.tvg ?? '').split('@');
      out.push({
        channel: channel || null,
        feed: feed || null,
        title: cur.title.replace(/\s*\[[^\]]+\]/g, '').replace(/\s*\(\d+[pi]\)/, '').trim(),
        url: line.trim(),
        referrer: cur.ref ?? null,
        user_agent: cur.ua ?? null,
        quality: cur.title.match(/\((\d+[pi])\)/)?.[1] ?? null,
        labels: [...cur.title.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]),
      });
      cur = null;
    }
  }
  return out;
}

const [channels, feeds, logos, categories, languages, countries, blocklist] = await Promise.all(
  ['channels', 'feeds', 'logos', 'categories', 'languages', 'countries', 'blocklist'].map(async (n) => parseCsv(await text(`${DB}/${n}.csv`))),
);
const streams = (await Promise.all([...COUNTRIES, ...EXTRA_STREAM_FILES].map(async (c) => parseM3u(await text(`${STREAMS}/${c}.m3u`).catch(() => ''))))).flat();

const curated = new Set(OFFICIAL_STREAM_RULES.map((r) => r.channel));
const wanted = new Set(COUNTRIES.map((c) => c.toUpperCase()));
const keep = channels.filter((c) => wanted.has(c.country) || curated.has(c.id));
const ids = new Set(keep.map((c) => c.id));

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: 'iptv-org/database + iptv-org/iptv (GitHub), Unlicense',
  channels: keep.map((c) => ({
    id: c.id, name: c.name, country: c.country, categories: list(c.categories), is_nsfw: bool(c.is_nsfw), closed: c.closed || null, website: c.website || null,
  })),
  feeds: feeds.filter((f) => ids.has(f.channel)).map((f) => ({ channel: f.channel, id: f.id, is_main: bool(f.is_main), languages: list(f.languages) })),
  logos: logos.filter((l) => ids.has(l.channel)).map((l) => ({ channel: l.channel, feed: l.feed || null, url: l.url, width: Number(l.width) || null, in_use: bool(l.in_use) })),
  streams: streams.filter((s) => s.channel && ids.has(s.channel)),
  categories: categories.map((c) => ({ id: c.id, name: c.name })),
  languages: languages.map((l) => ({ code: l.code, name: l.name })),
  countries: countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag })),
  blocklist: blocklist.filter((b) => ids.has(b.channel)).map((b) => ({ channel: b.channel, reason: b.reason })),
};

writeFileSync(new URL('../server/data/iptv-snapshot.json', import.meta.url), JSON.stringify(snapshot));
console.log(`Snapshot: ${snapshot.channels.length} Sender, ${snapshot.streams.length} Streams, ${snapshot.logos.length} Logos`);
