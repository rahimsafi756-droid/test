import type { Channel, LiveMeta, Notice, Paged, PlaybackSource } from '../../shared/types.ts';
import { loadIptv, type IptvData } from '../adapters/iptvOrg.ts';
import { matchOfficialRule } from '../data/official-streams.ts';
import { cache } from '../lib/cache.ts';

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['de'], { type: 'language' });
const CATEGORY_DE: Record<string, string> = {
  auto: 'Auto', animation: 'Animation', business: 'Wirtschaft', classic: 'Klassiker', comedy: 'Comedy', cooking: 'Kochen',
  culture: 'Kultur', documentary: 'Dokumentation', education: 'Bildung', entertainment: 'Unterhaltung', family: 'Familie',
  general: 'Vollprogramm', interactive: 'Interaktiv', kids: 'Kinder', legislative: 'Parlament', lifestyle: 'Lifestyle',
  movies: 'Filme', music: 'Musik', news: 'Nachrichten', outdoor: 'Outdoor', public: 'Öffentlich', relax: 'Entspannung',
  religious: 'Religion', series: 'Serien', science: 'Wissenschaft', shop: 'Shopping', sports: 'Sport', travel: 'Reisen', weather: 'Wetter',
};
const safe = (fn: () => string | undefined, fallback: string) => {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
};
export const countryLabel = (code: string, fallback?: string) => safe(() => regionNames.of(code), fallback ?? code);
export const languageLabel = (code: string, fallback?: string) => safe(() => languageNames.of(code), fallback ?? code);
export const categoryLabel = (id: string, fallback?: string) => CATEGORY_DE[id] ?? fallback ?? id;

interface BuiltChannel {
  channel: Omit<Channel, 'streams' | 'availability'>;
  streams: Omit<PlaybackSource, 'availableInRegion'>[];
  searchText: string;
}

/** Baut das Senderverzeichnis aus den iptv-org-Daten (einmal je Datenstand). */
function build(d: IptvData): BuiltChannel[] {
  return cache.get<BuiltChannel[]>(`live:built:${d.updatedAt}`) ?? buildFresh(d);
}

function buildFresh(d: IptvData): BuiltChannel[] {
  const blocked = new Set(d.blocklist.map((b) => b.channel));
  const countries = new Map(d.countries.map((c) => [c.code, c]));
  const catNames = new Map(d.categories.map((c) => [c.id, categoryLabel(c.id, c.name)]));
  const feedLangs = new Map<string, string[]>();
  for (const f of d.feeds) {
    if (f.is_main || !feedLangs.has(f.channel)) feedLangs.set(f.channel, f.languages);
  }
  const logos = new Map<string, string>();
  for (const l of d.logos) {
    if (l.feed || l.in_use === false || !l.url.startsWith('https://')) continue;
    if (!logos.has(l.channel)) logos.set(l.channel, l.url);
  }
  const streamsBy = new Map<string, IptvData['streams']>();
  for (const s of d.streams) {
    if (!s.channel) continue;
    const arr = streamsBy.get(s.channel) ?? [];
    arr.push(s);
    streamsBy.set(s.channel, arr);
  }
  const out: BuiltChannel[] = [];
  for (const c of d.channels) {
    if (c.is_nsfw || c.closed || blocked.has(c.id)) continue;
    const all = streamsBy.get(c.id) ?? [];
    const streams: BuiltChannel['streams'] = [];
    for (const s of all) {
      // Streams, die spezielle Header (Referer/User-Agent) erzwingen, kann ein Browser nicht korrekt abrufen
      if (s.referrer || s.user_agent) continue;
      const rule = matchOfficialRule(c.id, s.url);
      if (!rule || streams.some((x) => x.url === s.url)) continue;
      const geo = s.labels.includes('Geo-blocked');
      streams.push({
        id: `iptv:${c.id}:${streams.length}`,
        kind: 'hls',
        url: s.url,
        mimeType: 'application/vnd.apple.mpegurl',
        label: `${s.title || c.name}${s.quality ? ` (${s.quality})` : ''}${s.feed ? ` · ${s.feed}` : ''}`,
        isTrailer: false,
        provider: 'iptv',
        providerName: 'Offizielle Sender-CDN (gelistet bei iptv-org)',
        regions: rule.regions ?? 'worldwide',
        regionNote: rule.note ?? (geo ? 'Laut iptv-org regional gesperrt' : s.labels.includes('Not 24/7') ? 'Sendet nicht rund um die Uhr' : undefined),
        embed: 'unclear',
        embedNote: 'Frei zugänglicher Stream auf der Infrastruktur des Senders. Eine ausdrückliche Erlaubnis zur Einbettung durch Dritte ist nicht dokumentiert – im Zweifel die offizielle Seite nutzen.',
        homepage: rule.officialPage,
        quality: s.quality ?? undefined,
        checkedAt: rule.checkedAt,
      });
    }
    const country = countries.get(c.country);
    const languages = feedLangs.get(c.id) ?? [];
    const categories = c.categories.map((x) => catNames.get(x) ?? x);
    out.push({
      channel: {
        id: c.id,
        name: c.name,
        logoUrl: logos.get(c.id),
        country: c.country,
        countryName: countryLabel(c.country, country?.name),
        countryFlag: country?.flag,
        languages,
        categories: c.categories,
        website: c.website?.startsWith('http') ? c.website : undefined,
        hiddenUnverifiedStreams: all.length - streams.length,
      },
      streams,
      searchText: `${c.name} ${categories.join(' ')} ${country?.name ?? ''} ${countryLabel(c.country)}`.toLowerCase(),
    });
  }
  cache.set(`live:built:${d.updatedAt}`, out, 12 * 3600_000);
  return out;
}

function finalize(b: BuiltChannel, region: string): Channel {
  const streams = b.streams.map((s) => ({ ...s, availableInRegion: s.regions === 'worldwide' || s.regions.includes(region) }));
  return {
    ...b.channel,
    streams,
    availability: streams.some((s) => s.availableInRegion) ? 'direct' : 'none',
  };
}

export interface LiveQuery {
  q?: string;
  country?: string;
  language?: string;
  category?: string;
  playable: boolean;
  region: string;
  page: number;
  pageSize: number;
}

function dataNotices(d: IptvData): Notice[] {
  return d.origin === 'snapshot'
    ? [{ level: 'warning', code: 'iptv_snapshot', message: `iptv-org-API nicht erreichbar – es wird ein gespeicherter Datenstand vom ${d.updatedAt.slice(0, 10)} angezeigt (nur ausgewählte Länder).` }]
    : [];
}

export async function listChannels(q: LiveQuery): Promise<Paged<Channel>> {
  const d = await loadIptv();
  const term = q.q?.toLowerCase().trim();
  const items = build(d)
    .filter(
      (b) =>
        (!term || b.searchText.includes(term)) &&
        (!q.country || b.channel.country === q.country) &&
        (!q.language || b.channel.languages.includes(q.language)) &&
        (!q.category || b.channel.categories.includes(q.category)) &&
        (!q.playable || b.streams.length > 0),
    )
    .map((b) => finalize(b, q.region))
    // Abspielbare in der Region zuerst, dann alphabetisch
    .sort((a, b) => Number(b.availability === 'direct') - Number(a.availability === 'direct') || a.name.localeCompare(b.name, 'de'));
  const totalPages = Math.max(1, Math.ceil(items.length / q.pageSize));
  return {
    items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    page: q.page,
    totalPages,
    totalResults: items.length,
    notices: dataNotices(d),
  };
}

export async function getChannel(id: string, region: string): Promise<Channel | undefined> {
  const d = await loadIptv();
  const b = build(d).find((x) => x.channel.id === id);
  return b ? finalize(b, region) : undefined;
}

export async function liveMeta(): Promise<LiveMeta> {
  const d = await loadIptv();
  const built = build(d);
  const count = (key: (b: BuiltChannel) => string[]) => {
    const m = new Map<string, number>();
    for (const b of built) for (const k of key(b)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const countries = new Map(d.countries.map((c) => [c.code, `${c.flag ?? ''} ${countryLabel(c.code, c.name)}`.trim()]));
  const langs = new Map(d.languages.map((l) => [l.code, languageLabel(l.code, l.name)]));
  const cats = new Map(d.categories.map((c) => [c.id, categoryLabel(c.id, c.name)]));
  const facet = (m: Map<string, number>, names: Map<string, string>) =>
    [...m.entries()].map(([value, count]) => ({ value, label: names.get(value) ?? value, count })).sort((a, b) => b.count - a.count);
  return {
    countries: facet(count((b) => [b.channel.country]), countries),
    languages: facet(count((b) => b.channel.languages), langs).slice(0, 60),
    categories: facet(count((b) => b.channel.categories), cats),
    dataOrigin: d.origin,
    updatedAt: d.updatedAt,
    notices: dataNotices(d),
  };
}

/** Abspielbare Sender für die Startseite */
export async function featuredChannels(region: string, n = 12): Promise<Channel[]> {
  const res = await listChannels({ playable: true, region, page: 1, pageSize: 200 });
  return res.items.filter((c) => c.availability === 'direct').slice(0, n);
}
