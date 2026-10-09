/**
 * Nachgebildete Antworten der externen APIs (Format gemäss jeweiliger Doku)
 * für Tests in einer Umgebung ohne Internetzugang. Wird NUR in Tests geladen.
 */
export const TEST_KEY = 'test-secret-token-should-never-leak';
export const YT_TEST_KEY = 'yt-secret-key-should-never-leak';

const ytVideo = (id: string, title: string, duration: string, extra: { embeddable?: boolean; live?: string; allowed?: string[]; blocked?: string[]; channelId?: string; lang?: string } = {}) => ({
  id,
  snippet: {
    title,
    description: `Beschreibung von ${title} https://example.org/link`,
    channelId: extra.channelId ?? 'UCGkHFrwE8KEuOHPVsIOskAg',
    tags: ['Komödie'],
    defaultAudioLanguage: extra.lang,
    liveBroadcastContent: extra.live ?? 'none',
    thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
  },
  contentDetails: { duration, ...(extra.allowed || extra.blocked ? { regionRestriction: { allowed: extra.allowed, blocked: extra.blocked } } : {}) },
  status: { embeddable: extra.embeddable ?? true, privacyStatus: 'public' },
});

const YT_VIDEOS = [
  ytVideo('nk1AAAAAAAA', 'Der Bergdoktor (1992) | Ganzer Film Deutsch', 'PT1H35M12S', { lang: 'de' }),
  ytVideo('nk2AAAAAAAA', 'Irgendein Film - Trailer', 'PT2M10S'),
  ytVideo('nk3AAAAAAAA', 'Nicht einbettbar (Ganzer Film)', 'PT1H40M', { embeddable: false }),
  ytVideo('nk4AAAAAAAA', 'In CH gesperrt | Ganzer Film', 'PT1H30M', { blocked: ['CH', 'LI'] }),
  ytVideo('nk5AAAAAAAA', 'Live-Premiere Ganzer Film', 'PT2H', { live: 'live' }),
  ytVideo('md1AAAAAAAA', 'Nur DE und AT [HD] (Ganzer Film)', 'PT1H40M', { allowed: ['DE', 'AT'], channelId: 'UCmoviedome' }),
  ytVideo('bl1AAAAAAAA', 'Sprite Fright - Blender Open Movie', 'PT10M29S', { channelId: 'UCz75RVbH8q2jdBJ4SnwuZZQ', lang: 'en' }),
  ytVideo('bl2AAAAAAAA', 'Blender Tutorial: Modeling basics', 'PT30M', { channelId: 'UCz75RVbH8q2jdBJ4SnwuZZQ' }),
];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const tmdbMovie = {
  id: 10378,
  title: 'Big Buck Bunny',
  original_title: 'Big Buck Bunny',
  overview: 'Ein dicker Hase rächt sich an drei Nagern.',
  poster_path: '/bbb.jpg',
  backdrop_path: '/bbb-bg.jpg',
  release_date: '2008-05-30',
  genre_ids: [16, 35],
  original_language: 'en',
  vote_average: 6.4,
  popularity: 10,
};
const tmdbOther = { ...tmdbMovie, id: 603, title: 'Matrix', original_title: 'The Matrix', release_date: '1999-03-31', genre_ids: [28, 878], vote_average: 8.2 };

const tmdbShow = { id: 1399, name: 'Testserie', original_name: 'Test Show', overview: 'Eine Serie.', poster_path: '/s.jpg', first_air_date: '2011-04-17', genre_ids: [18], original_language: 'en', vote_average: 8.4 };

export const calls: string[] = [];

export function installMockFetch(opts: { failHosts?: string[] } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.href);
    if (opts.failHosts?.includes(url.hostname)) throw new TypeError('fetch failed');
    const p = url.pathname;

    // ---------- TMDB ----------
    if (url.hostname === 'api.themoviedb.org') {
      const auth = new Headers(init?.headers).get('authorization');
      if (auth !== `Bearer ${TEST_KEY}`) return json({ status_message: 'Invalid API key' }, 401);
      if (p.endsWith('/genre/movie/list')) return json({ genres: [{ id: 16, name: 'Animation' }, { id: 35, name: 'Komödie' }, { id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }] });
      if (p.endsWith('/genre/tv/list')) return json({ genres: [{ id: 18, name: 'Drama' }] });
      if (p.endsWith('/search/movie') || p.endsWith('/discover/movie')) return json({ page: 1, total_pages: 3, total_results: 55, results: [tmdbMovie, tmdbOther] });
      if (p.endsWith('/search/tv') || p.endsWith('/discover/tv')) return json({ page: 1, total_pages: 1, total_results: 1, results: [tmdbShow] });
      if (p === '/3/movie/603/watch/providers') return json({ id: 603, results: { CH: { link: 'https://www.themoviedb.org/movie/603/watch?locale=CH', flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg' }], rent: [{ provider_name: 'Apple TV', logo_path: '/a.jpg' }] } } });
      if (p === '/3/movie/10378/watch/providers') return json({ id: 10378, results: {} });
      if (p === '/3/tv/1399/watch/providers') return json({ id: 1399, results: { CH: { link: 'x', ads: [{ provider_name: 'Pluto TV', logo_path: null }] } } });
      if (p === '/3/movie/603')
        return json({
          ...tmdbOther,
          genres: [{ id: 28, name: 'Action' }],
          runtime: 136,
          credits: { cast: [{ name: 'Keanu Reeves', character: 'Neo', profile_path: null }], crew: [{ name: 'Lana Wachowski', job: 'Director' }] },
          videos: { results: [{ key: 'vKQi3bBA1y8', site: 'YouTube', type: 'Trailer', name: 'Offizieller Trailer', official: true }, { key: 'bad key!', site: 'YouTube', type: 'Trailer', name: 'x' }] },
          'watch/providers': { results: { CH: { link: 'https://www.themoviedb.org/movie/603/watch?locale=CH', flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg' }] } } },
        });
      if (p === '/3/movie/10378') return json({ ...tmdbMovie, genres: [{ id: 16, name: 'Animation' }], runtime: 10, credits: { cast: [], crew: [] }, videos: { results: [] }, 'watch/providers': { results: {} } });
      if (p === '/3/tv/1399')
        return json({
          ...tmdbShow,
          genres: [{ id: 18, name: 'Drama' }],
          episode_run_time: [55],
          seasons: [
            { season_number: 0, name: 'Specials', episode_count: 1 },
            { season_number: 1, name: 'Staffel 1', episode_count: 2 },
            { season_number: 2, name: 'Staffel 2', episode_count: 1 },
          ],
          credits: { cast: [], crew: [] },
          videos: { results: [] },
          'watch/providers': { results: { CH: { link: 'x', ads: [{ provider_name: 'Pluto TV', logo_path: null }] } } },
        });
      if (p === '/3/tv/1399/season/1')
        return json({
          season_number: 1,
          name: 'Staffel 1',
          episodes: [
            { id: 2, episode_number: 2, season_number: 1, name: 'Zweite Folge' },
            { id: 1, episode_number: 1, season_number: 1, name: 'Erste Folge', runtime: 50 },
          ],
        });
      if (p === '/3/tv/1399/season/2') return json({ season_number: 2, name: 'Staffel 2', episodes: [{ id: 3, episode_number: 1, season_number: 2, name: 'Neue Staffel' }] });
      return json({ status_message: 'not found' }, 404);
    }

    // ---------- YouTube Data API ----------
    if (url.hostname === 'www.googleapis.com' && p.startsWith('/youtube/v3/')) {
      if (url.searchParams.get('key') !== YT_TEST_KEY) return json({ error: { code: 400, message: 'API key not valid' } }, 400);
      const sp = url.searchParams;
      if (p.endsWith('/channels')) {
        const map: Record<string, string> = { UCGkHFrwE8KEuOHPVsIOskAg: 'UUnetzkino', '@Moviedome': 'UUmoviedome', UCz75RVbH8q2jdBJ4SnwuZZQ: 'UUblender' };
        const key = sp.get('id') ?? sp.get('forHandle') ?? '';
        return json(map[key] ? { items: [{ id: key, snippet: { title: key }, contentDetails: { relatedPlaylists: { uploads: map[key] } } }] } : { items: [] });
      }
      if (p.endsWith('/playlistItems')) {
        const pl = sp.get('playlistId');
        const ids = YT_VIDEOS.filter((v) => (pl === 'UUnetzkino' ? v.id.startsWith('nk') : pl === 'UUmoviedome' ? v.id.startsWith('md') : v.id.startsWith('bl'))).map((v) => v.id);
        // Seitenweise Auslieferung testen: Netzkino in zwei Seiten
        if (pl === 'UUnetzkino' && !sp.get('pageToken')) return json({ nextPageToken: 'p2', items: ids.slice(0, 2).map((videoId) => ({ contentDetails: { videoId } })) });
        if (pl === 'UUnetzkino') return json({ items: ids.slice(2).map((videoId) => ({ contentDetails: { videoId } })) });
        return json({ items: ids.map((videoId) => ({ contentDetails: { videoId } })) });
      }
      if (p.endsWith('/videos')) {
        const ids = (sp.get('id') ?? '').split(',');
        return json({ items: YT_VIDEOS.filter((v) => ids.includes(v.id)) });
      }
      return json({}, 404);
    }

    // ---------- TVmaze ----------
    if (url.hostname === 'api.tvmaze.com') {
      const show = { id: 82, name: 'Maze Show', language: 'German', genres: ['Drama', 'Science-Fiction'], premiered: '2017-12-01', rating: { average: 8.1 }, weight: 99, image: { medium: 'http://static.tvmaze.com/x.jpg', original: null }, summary: '<p>Eine <b>Serie</b> &amp; mehr.</p>', officialSite: 'https://example.org' };
      if (p === '/search/shows') return json([{ score: 1, show }]);
      if (p === '/shows') return json(url.searchParams.get('page') === '0' ? [show, { ...show, id: 83, name: 'Andere', language: 'English', genres: ['Comedy'], weight: 50, premiered: '2001-01-01' }] : []);
      if (p === '/shows/82')
        return json({
          ...show,
          _embedded: {
            seasons: [
              { id: 501, number: 1, name: '', episodeOrder: 3 },
              { id: 502, number: 2, name: 'Finale', episodeOrder: 1 },
            ],
            cast: [{ person: { name: 'Louis Hofmann', image: null }, character: { name: 'Jonas' } }],
          },
        });
      if (p === '/seasons/501/episodes')
        return json([
          { id: 11, season: 1, number: 2, name: 'B' },
          { id: 10, season: 1, number: 1, name: 'A', summary: '<p>Start</p>' },
          { id: 12, season: 1, number: null, name: 'Special' },
        ]);
      if (p === '/seasons/502/episodes') return json([{ id: 20, season: 2, number: 1, name: 'Ende' }]);
      return json({}, 404);
    }

    // ---------- Wikidata / Commons ----------
    if (url.hostname === 'query.wikidata.org') {
      const b = (v: string) => ({ value: v });
      return json({
        results: {
          bindings: [
            { film: b('http://www.wikidata.org/entity/Q1'), label: b('Big Buck Bunny'), videoFile: b('http://commons.wikimedia.org/wiki/Special:FilePath/Big%20Buck%20Bunny%204K.webm'), pub: b('2008-04-10T00:00:00Z'), tmdbId: b('10378'), licenses: b('Creative Commons Attribution 3.0 Unported'), pdJurisdictions: b(''), genres: b('Animationsfilm|Kurzfilm') },
            { film: b('http://www.wikidata.org/entity/Q2'), label: b('Nur US-gemeinfrei'), videoFile: b('http://commons.wikimedia.org/wiki/Special:FilePath/US.webm'), pub: b('1968-01-01T00:00:00Z'), licenses: b(''), pdJurisdictions: b('Q30'), genres: b('Horrorfilm') },
            { film: b('http://www.wikidata.org/entity/Q3'), label: b('Nosferatu'), videoFile: b('http://commons.wikimedia.org/wiki/Special:FilePath/Nosferatu.webm'), pub: b('1922-03-04T00:00:00Z'), licenses: b(''), pdJurisdictions: b('Q39|Q183'), genres: b('Stummfilm|Horrorfilm'), lang: b('de') },
          ],
        },
      });
    }
    if (url.hostname === 'commons.wikimedia.org' && p === '/w/api.php') {
      const title = url.searchParams.get('titles') ?? '';
      return json({
        query: {
          pages: [
            {
              title,
              videoinfo: [
                {
                  url: 'https://upload.wikimedia.org/wikipedia/commons/x/orig.webm',
                  mime: 'video/webm',
                  height: 2160,
                  derivatives: [
                    { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/x/x.webm.720p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', height: 720 },
                    { src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/x/x.webm.480p.vp9.webm', type: 'video/webm; codecs="vp9, opus"', height: 480 },
                    { src: 'http://insecure.example/x.webm', type: 'video/webm', height: 360 },
                  ],
                  extmetadata: { LicenseShortName: { value: 'CC BY 3.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0' } },
                },
              ],
            },
          ],
        },
      });
    }

    // ---------- Internet Archive ----------
    if (url.hostname === 'archive.org') {
      if (p === '/advancedsearch.php')
        return json({
          response: {
            numFound: 3,
            docs: [
              { identifier: 'his_girl_friday', title: 'His Girl Friday', year: '1940', licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/', subject: ['comedy', 'film noir'], language: 'English' },
              { identifier: 'no_license', title: 'Ohne Lizenz' },
              { identifier: 'cc_film', title: 'CC Film', year: 2010, licenseurl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
            ],
          },
        });
      if (p === '/metadata/his_girl_friday') return json({ metadata: {}, files: [{ name: 'hgf.ogv', format: 'Ogg Video' }, { name: 'hgf_512kb.mp4', format: '512Kb MPEG4' }, { name: 'hgf.mp4', format: 'h.264', height: '480' }, { name: 'hgf.de.vtt', format: 'Web Video Text Tracks' }] });
      return json({}, 404);
    }

    // ---------- iptv-org (API nicht erreichbar → Snapshot) ----------
    if (url.hostname === 'iptv-org.github.io') throw new TypeError('fetch failed');

    return real(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}
