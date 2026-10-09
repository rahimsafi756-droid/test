import { describe, expect, it } from 'vitest';
import { installMockFetch } from './mockFetch.ts';
import { matchOfficialRule } from '../server/data/official-streams.ts';

installMockFetch();
const { app } = await import('../server/app.ts');
const get = async (path: string) => (await app.request(path)).json() as Promise<any>;

describe('Live-TV', () => {
  it('fällt bei API-Ausfall auf den Snapshot zurück und meldet das', async () => {
    const body = await get('/api/live/channels?region=CH');
    expect(body.notices[0].code).toBe('iptv_snapshot');
    expect(body.items.length).toBeGreaterThan(5);
    // Nur abspielbare Sender, abspielbare in CH zuerst
    expect(body.items[0].availability).toBe('direct');
    expect(body.items.every((c: { streams: unknown[] }) => c.streams.length > 0)).toBe(true);
  });

  it('nur offizielle HTTPS-Streams werden abspielbar', () => {
    expect(matchOfficialRule('DW.de', 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8')).toBeTruthy();
    expect(matchOfficialRule('DW.de', 'http://170.83.16.50/DW/index.m3u8')).toBeUndefined();
    expect(matchOfficialRule('SRFzwei.ch', 'https://7nyaler.streamhostingcdn.top/stream/51/index.m3u8')).toBeUndefined();
    expect(matchOfficialRule('DW.de', 'https://evil.example/dwamdstream102.akamaized.net/x.m3u8')).toBeUndefined();
    expect(matchOfficialRule('DasErste.de', 'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8')).toBeUndefined();
    expect(matchOfficialRule('DasErste.de', 'https://daserste-live.ard-mcdn.de/daserste/live/hls/int/master.m3u8')).toBeTruthy();
  });

  it('Geosperren: 3sat in CH abspielbar, ZDF nur in DE', async () => {
    const sat = await get('/api/live/channel/3sat.de?region=CH');
    expect(sat.availability).toBe('direct');
    const zdfCH = await get('/api/live/channel/ZDF.de?region=CH');
    expect(zdfCH.availability).toBe('none');
    expect(zdfCH.streams[0].availableInRegion).toBe(false);
    const zdfDE = await get('/api/live/channel/ZDF.de?region=DE');
    expect(zdfDE.availability).toBe('direct');
  });

  it('Drittanbieter-Restreams werden ausgeblendet', async () => {
    const srf = await get('/api/live/channel/SRFzwei.ch?region=CH');
    expect(srf.streams).toHaveLength(0);
    expect(srf.availability).toBe('none');
    expect(srf.hiddenUnverifiedStreams).toBeGreaterThan(0);
  });

  it('Filter nach Land, Sprache, Kategorie und Suche', async () => {
    const ch = await get('/api/live/channels?country=CH&playable=0');
    expect(ch.items.every((c: { country: string }) => c.country === 'CH')).toBe(true);
    const news = await get('/api/live/channels?category=news');
    expect(news.items.every((c: { categories: string[] }) => c.categories.includes('news'))).toBe(true);
    const fra = await get('/api/live/channels?language=fra');
    expect(fra.items.every((c: { languages: string[] }) => c.languages.includes('fra'))).toBe(true);
    const q = await get('/api/live/channels?q=tagesschau');
    expect(q.items[0].name).toMatch(/tagesschau/i);
    const meta = await get('/api/live/meta');
    expect(meta.countries.find((c: { value: string }) => c.value === 'CH').label).toContain('Schweiz');
  });
});
