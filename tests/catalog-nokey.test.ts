import { describe, expect, it } from 'vitest';
import { installMockFetch } from './mockFetch.ts';

delete process.env.TMDB_READ_ACCESS_TOKEN;
delete process.env.TMDB_API_KEY;
installMockFetch();
const { app } = await import('../server/app.ts');

const get = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as any };
};

describe('Ohne TMDB-Schlüssel', () => {
  it('Filme: nur freie Titel + verständlicher Hinweis', async () => {
    const { body } = await get('/api/catalog?kind=movie&region=CH');
    expect(body.notices.map((n: { code: string }) => n.code)).toContain('tmdb_missing');
    const titles = body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('Big Buck Bunny');
    // Internet-Archive-Eintrag ohne Lizenz wird nie übernommen
    expect(titles).not.toContain('Ohne Lizenz');
  });

  it('Internet Archive: im strengen Modus nicht direkt, im erweiterten Modus schon', async () => {
    const strict = await get('/api/catalog?kind=movie&trust=strict&q=his girl');
    expect(strict.body.items[0]).toMatchObject({ title: 'His Girl Friday', availability: 'none' });
    const ext = await get('/api/catalog?kind=movie&trust=extended&q=his girl');
    expect(ext.body.items[0]).toMatchObject({ title: 'His Girl Friday', availability: 'direct' });
    const d = await get('/api/title/archive:movie:his_girl_friday?trust=extended');
    expect(d.body.sources[0]).toMatchObject({ kind: 'file', url: 'https://archive.org/download/his_girl_friday/hgf.mp4', availableInRegion: true });
    expect(d.body.sources[0].license.trust).toBe('declared');
    expect(d.body.sources[0].subtitles[0].lang).toBe('de');
    const ds = await get('/api/title/archive:movie:his_girl_friday?trust=strict');
    expect(ds.body.availability).toBe('none');
    expect(ds.body.sources.every((s: { availableInRegion: boolean }) => !s.availableInRegion)).toBe(true);
  });

  it('Suche und Filter auf freien Titeln', async () => {
    const g = await get('/api/catalog?kind=movie&genre=silent');
    expect(g.body.items.map((i: { title: string }) => i.title)).toEqual(['Nosferatu']);
    const y = await get('/api/catalog?kind=movie&yearFrom=2000');
    expect(y.body.items.every((i: { year: number }) => i.year >= 2000)).toBe(true);
    const l = await get('/api/catalog?kind=movie&lang=de');
    expect(l.body.items.map((i: { title: string }) => i.title)).toEqual(['Nosferatu']);
    const q = await get('/api/catalog?kind=movie&q=nosferátu');
    expect(q.body.items).toHaveLength(1);
  });

  it('Serien kommen von TVmaze (HTML entfernt, HTTPS-Bilder)', async () => {
    const { body } = await get('/api/catalog?kind=series&q=maze');
    expect(body.items[0]).toMatchObject({ id: 'tvmaze:series:82', title: 'Maze Show', overview: 'Eine Serie & mehr.', originalLanguage: 'de', availabilityKnown: false });
    expect(body.items[0].posterUrl).toMatch(/^https:/);
    const sorted = await get('/api/catalog?kind=series&sort=title');
    expect(sorted.body.items.map((i: { title: string }) => i.title)).toEqual(['Andere', 'Maze Show']);
  });

  it('TVmaze: Staffeln & Episoden korrekt zugeordnet', async () => {
    const t = await get('/api/title/tvmaze:series:82');
    expect(t.body.seasons.map((s: { number: number; name: string }) => `${s.number}:${s.name}`)).toEqual(['1:Staffel 1', '2:Finale']);
    const s1 = await get('/api/title/tvmaze:series:82/season/1');
    expect(s1.body.episodes.map((e: { episodeNumber: number; title: string }) => `${e.episodeNumber}:${e.title}`)).toEqual(['1:A', '2:B', '3:Special']);
    const s2 = await get('/api/title/tvmaze:series:82/season/2');
    expect(s2.body.episodes.map((e: { title: string }) => e.title)).toEqual(['Ende']);
  });

  it('TMDB-IDs ohne Schlüssel → 404 statt Absturz', async () => {
    expect((await get('/api/title/tmdb:movie:603')).status).toBe(404);
  });

  it('Eingaben werden validiert', async () => {
    expect((await get('/api/catalog?kind=movie&yearFrom=abc')).status).toBe(400);
    expect((await get('/api/catalog?kind=movie&region=schweiz')).status).toBe(400);
    expect((await get('/api/title/..%2F..%2Fetc')).status).toBe(404);
    expect((await get('/api/title/tvmaze:series:82/season/-1')).status).toBe(400);
    expect((await get('/api/live/channel/%3Cscript%3E')).status).toBe(400);
  });
});
