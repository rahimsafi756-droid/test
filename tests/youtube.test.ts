import { describe, expect, it } from 'vitest';
import { installMockFetch, YT_TEST_KEY } from './mockFetch.ts';

delete process.env.TMDB_READ_ACCESS_TOKEN;
process.env.YOUTUBE_API_KEY = YT_TEST_KEY;
installMockFetch({ failHosts: ['query.wikidata.org', 'archive.org'] });
const { app } = await import('../server/app.ts');
// erst nach dem Setzen der Umgebungsvariablen laden (Konfiguration wird beim Import gelesen)
const { cleanFilmTitle, isoDurationMinutes } = await import('../server/adapters/youtube.ts');

const get = async (path: string) => {
  const res = await app.request(path);
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as any };
};

describe('YouTube – offizielle Kanäle', () => {
  it('Hilfsfunktionen: Dauer und Titelbereinigung', () => {
    expect(isoDurationMinutes('PT1H35M12S')).toBeCloseTo(95.2, 1);
    expect(isoDurationMinutes('PT10M29S')).toBeCloseTo(10.48, 1);
    expect(isoDurationMinutes('P1DT1M')).toBe(1441);
    expect(cleanFilmTitle('Der Bergdoktor (1992) | Ganzer Film Deutsch')).toEqual({ title: 'Der Bergdoktor', year: 1992 });
    expect(cleanFilmTitle('Nur DE und AT [HD] (Ganzer Film)').title).toBe('Nur DE und AT');
    expect(cleanFilmTitle('Sprite Fright - Blender Open Movie').title).toBe('Sprite Fright');
  });

  it('nur ganze, einbettbare, öffentliche Filme; Trailer/Livestreams/Tutorials ausgeschlossen', async () => {
    const { body } = await get('/api/catalog?kind=movie&region=CH');
    const ids = body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['youtube:movie:nk1AAAAAAAA', 'youtube:movie:nk4AAAAAAAA', 'youtube:movie:md1AAAAAAAA', 'youtube:movie:bl1AAAAAAAA']));
    for (const bad of ['nk2AAAAAAAA', 'nk3AAAAAAAA', 'nk5AAAAAAAA', 'bl2AAAAAAAA']) expect(ids).not.toContain(`youtube:movie:${bad}`);
    // Seite 2 der Upload-Playlist wurde gelesen
    expect(ids).toContain('youtube:movie:nk4AAAAAAAA');
  });

  it('regionale Sperren werden je Region ausgewertet', async () => {
    const ch = await get('/api/catalog?kind=movie&region=CH&avail=direct');
    const chIds = ch.body.items.map((i: { id: string }) => i.id);
    expect(chIds).toContain('youtube:movie:nk1AAAAAAAA');
    expect(chIds).not.toContain('youtube:movie:nk4AAAAAAAA'); // blocked: CH
    expect(chIds).not.toContain('youtube:movie:md1AAAAAAAA'); // allowed: nur DE, AT
    const de = await get('/api/catalog?kind=movie&region=DE&avail=direct');
    const deIds = de.body.items.map((i: { id: string }) => i.id);
    expect(deIds).toEqual(expect.arrayContaining(['youtube:movie:nk4AAAAAAAA', 'youtube:movie:md1AAAAAAAA']));
  });

  it('Detailseite: offizieller Einbettungsplayer, als ganzer Film (nicht Trailer) gekennzeichnet', async () => {
    const { body, text } = await get('/api/title/youtube:movie:nk1AAAAAAAA?region=CH');
    expect(body).toMatchObject({ title: 'Der Bergdoktor', year: 1992, availability: 'direct', runtimeMin: 95, originalLanguage: 'de' });
    expect(body.sources[0]).toMatchObject({ kind: 'youtube', isTrailer: false, embed: 'allowed', availableInRegion: true, url: 'https://www.youtube-nocookie.com/embed/nk1AAAAAAAA' });
    expect(body.sources[0].license.trust).toBe('curated');
    expect(body.overview).not.toContain('https://');
    expect(text).not.toContain(YT_TEST_KEY);
    const blocked = await get('/api/title/youtube:movie:nk4AAAAAAAA?region=CH');
    expect(blocked.body.availability).toBe('none');
    expect(blocked.body.sources[0].availableInRegion).toBe(false);
  });

  it('nicht gefundener Kanal wird gemeldet, Schlüssel bleibt geheim', async () => {
    const { body, text } = await get('/api/catalog?kind=movie');
    expect(body.notices.some((n: { code: string; message: string }) => n.code === 'youtube_channel' && n.message.includes('Moviedome IT'))).toBe(true);
    expect(text).not.toContain(YT_TEST_KEY);
    const s = await get('/api/sources');
    expect(s.body.find((x: { id: string }) => x.id === 'youtube').configured).toBe(true);
    expect(s.text).not.toContain(YT_TEST_KEY);
  });
});
