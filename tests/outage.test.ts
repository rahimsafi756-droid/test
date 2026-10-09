import { describe, expect, it } from 'vitest';
import { installMockFetch } from './mockFetch.ts';

delete process.env.TMDB_READ_ACCESS_TOKEN;
installMockFetch({ failHosts: ['query.wikidata.org', 'archive.org', 'api.tvmaze.com'] });
const { app } = await import('../server/app.ts');

describe('Ausgefallene Quellen', () => {
  it('Katalog antwortet mit verständlichen Hinweisen statt Fehler', async () => {
    const res = await app.request('/api/catalog?kind=movie');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(0);
    const codes = body.notices.map((n: { code: string }) => n.code);
    expect(codes).toEqual(expect.arrayContaining(['wikidata_down', 'archive_down', 'tmdb_missing']));
    expect(body.notices[0].message).toMatch(/nicht erreichbar/);
  }, 20_000);

  it('Serien: TVmaze-Ausfall wird gemeldet', async () => {
    const body = (await (await app.request('/api/catalog?kind=series')).json()) as any;
    expect(body.notices.some((n: { code: string; level: string }) => n.code === 'tvmaze_error' && n.level === 'error')).toBe(true);
  }, 20_000);

  it('Startseite funktioniert trotzdem (Live-TV aus Snapshot)', async () => {
    const res = await app.request('/api/home');
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.channels.length).toBeGreaterThan(0);
  }, 30_000);
});
