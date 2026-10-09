import { beforeAll, describe, expect, it } from 'vitest';
import { installMockFetch, TEST_KEY } from './mockFetch.ts';

process.env.TMDB_READ_ACCESS_TOKEN = TEST_KEY;
installMockFetch();
const { app } = await import('../server/app.ts');

async function get(path: string) {
  const res = await app.request(path);
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
}

describe('Katalog mit TMDB-Schlüssel', () => {
  let movies: Awaited<ReturnType<typeof get>>;
  beforeAll(async () => {
    movies = await get('/api/catalog?kind=movie&region=CH');
  });

  it('liefert Filme mit Verfügbarkeitskennzeichnung', () => {
    expect(movies.status).toBe(200);
    const byTitle = Object.fromEntries(movies.body.items.map((i: { title: string; availability: string }) => [i.title, i.availability]));
    expect(byTitle['Matrix']).toBe('subscription');
    // TMDB-Titel mit passender freier Quelle (Wikidata P4947) → direkt
    expect(byTitle['Big Buck Bunny']).toBe('direct');
    // In CH gemeinfrei → direkt; nur in den USA gemeinfrei → nicht direkt und nicht vorangestellt
    expect(byTitle['Nosferatu']).toBe('direct');
    expect(byTitle['Nur US-gemeinfrei']).toBeUndefined();
  });

  it('gibt den TMDB-Schlüssel niemals an den Browser weiter', async () => {
    expect(movies.text).not.toContain(TEST_KEY);
    const d = await get('/api/title/tmdb:movie:603?region=CH');
    expect(d.text).not.toContain(TEST_KEY);
    const s = await get('/api/sources');
    expect(s.text).not.toContain(TEST_KEY);
    expect(s.body.find((x: { id: string }) => x.id === 'tmdb').configured).toBe(true);
  });

  it('Detailseite: Anbieter, Trailer (gekennzeichnet), Besetzung', async () => {
    const { body } = await get('/api/title/tmdb:movie:603?region=CH');
    expect(body.availability).toBe('subscription');
    expect(body.offers[0]).toMatchObject({ providerName: 'Netflix', availability: 'subscription' });
    expect(body.trailers).toHaveLength(1); // ungültiger YouTube-Key wird verworfen
    expect(body.trailers[0]).toMatchObject({ isTrailer: true, kind: 'youtube' });
    expect(body.trailers[0].url).toBe('https://www.youtube-nocookie.com/embed/vKQi3bBA1y8');
    expect(body.sources).toHaveLength(0);
    expect(body.directors).toEqual(['Lana Wachowski']);
  });

  it('Detailseite: direkte Quelle von Commons nur über HTTPS', async () => {
    const { body } = await get('/api/title/tmdb:movie:10378?region=CH');
    expect(body.availability).toBe('direct');
    expect(body.sources.map((s: { quality: string }) => s.quality)).toEqual(['720p', '480p']);
    expect(body.sources.every((s: { url: string; availableInRegion: boolean; isTrailer: boolean }) => s.url.startsWith('https://') && s.availableInRegion && !s.isTrailer)).toBe(true);
    expect(body.sources[0].license.basis).toContain('CC BY 3.0');
  });

  it('Serien: Staffeln und Episoden korrekt zugeordnet und sortiert', async () => {
    const t = await get('/api/title/tmdb:tv:1399?region=CH');
    expect(t.body.seasons.map((s: { number: number }) => s.number)).toEqual([0, 1, 2]);
    expect(t.body.availability).toBe('free_provider');
    const s1 = await get('/api/title/tmdb:tv:1399/season/1');
    expect(s1.body.episodes.map((e: { seasonNumber: number; episodeNumber: number }) => `${e.seasonNumber}x${e.episodeNumber}`)).toEqual(['1x1', '1x2']);
    const s2 = await get('/api/title/tmdb:tv:1399/season/2');
    expect(s2.body.episodes).toHaveLength(1);
    expect(s2.body.episodes[0].seasonNumber).toBe(2);
  });

  it('Region USA: US-gemeinfreier Titel wird direkt abspielbar', async () => {
    const { body } = await get('/api/catalog?kind=movie&region=US&avail=direct');
    expect(body.items.map((i: { title: string }) => i.title)).toContain('Nur US-gemeinfrei');
    const ch = await get('/api/catalog?kind=movie&region=CH&avail=direct');
    expect(ch.body.items.map((i: { title: string }) => i.title)).not.toContain('Nur US-gemeinfrei');
  });

  it('Filter "nur direkt" bei Serien liefert leeren Zustand mit Hinweis', async () => {
    const { body } = await get('/api/catalog?kind=series&avail=direct');
    expect(body.items).toHaveLength(0);
    expect(body.notices[0].code).toBe('no_direct_series');
  });

  it('Startseite enthält Zeilen und Live-Sender', async () => {
    const { status, body } = await get('/api/home?region=CH');
    expect(status).toBe(200);
    expect(body.rows.map((r: { id: string }) => r.id)).toContain('direct');
    expect(body.channels.length).toBeGreaterThan(0);
  });
});
