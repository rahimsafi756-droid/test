/**
 * Browser-Ende-zu-Ende-Test mit Playwright (Chromium).
 * Voraussetzungen: npm run build, ffmpeg, Playwright.
 * Aufruf: node tests/e2e/browser-flow.mjs <medienordner> <screenshotordner>
 *
 * Testmedien erzeugen (VP9/Opus, da Test-Chromium kein H.264 kann):
 *   ffmpeg -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine -t 20 -c:v libvpx-vp9 -c:a libopus <m>/bbb.webm
 *   für h in 360 240: ffmpeg -f lavfi -i testsrc2=size=WxH:rate=25 -f lavfi -i sine -t 30 -c:v libvpx-vp9 -g 50 -c:a libopus \
 *     -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_type fmp4 <m>/hls/<h>/index.m3u8
 *   plus <m>/hls/master.m3u8 mit beiden Varianten (CODECS="vp09.00.30.08,opus")
 *
 * Die Video-Hosts (upload.wikimedia.org, Sender-CDN) werden im Browser auf
 * lokal erzeugte Testvideos umgeleitet. Damit wird der eigene Player und der
 * gesamte Ablauf geprüft – NICHT die Erreichbarkeit der echten Streams.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pwPath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium, devices } = await import(pwPath);
const MEDIA = process.argv[2];
const SHOTS = process.argv[3];
mkdirSync(SHOTS, { recursive: true });
if (!existsSync(join(MEDIA, 'bbb.webm'))) throw new Error('Testmedien fehlen');

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['--import', 'tsx', '--import', './tests/e2e/preload.ts', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('läuft') && resolve()));

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['OK', name]);
  } catch (e) {
    results.push(['FEHLER', `${name}: ${e.message.split('\n')[0]}`]);
  }
};
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};

const mime = (f) => (f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : f.endsWith('.m4s') || f.endsWith('.mp4') ? 'video/mp4' : 'video/webm');

async function setupRoutes(ctx) {
  // Bilder externer CDNs im Test nicht laden (kein Internet)
  await ctx.route(/image\.tmdb\.org|static\.tvmaze\.com|imgur\.com|wikipedia\/commons\/thumb|Special:FilePath|archive\.org\/services/, (r) => r.fulfill({ status: 204, body: '' }));
  await ctx.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: readFileSync(join(MEDIA, 'bbb.webm')), headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route(/dwamdstream\d+\.akamaized\.net/, (r) => {
    const u = new URL(r.request().url());
    const file = u.pathname.endsWith('master.m3u8') ? 'master.m3u8' : u.pathname.split('/').slice(-2).join('/');
    const local = join(MEDIA, 'hls', file);
    if (!existsSync(local)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: mime(file), body: readFileSync(local), headers: { 'access-control-allow-origin': '*' } });
  });
  // YouTube-Einbettungsplayer durch Platzhalter ersetzen (kein Internet)
  await ctx.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<body style="background:#000;color:#fff">YouTube-Player (Testplatzhalter)</body>' }));
  await ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ status: 204, body: '' }));
  // Simulierte Geosperre für tagesschau24
  await ctx.route(/tagesschau\.akamaized\.net/, (r) => r.fulfill({ status: 403, body: 'forbidden', headers: { 'access-control-allow-origin': '*' } }));
}

const browser = await chromium.launch();
try {
  // ---------- Desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'de-CH' });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  await check('Startseite lädt mit Zeilen und Live-Sendern', async () => {
    await page.goto(BASE + '/');
    await page.getByRole('heading', { name: 'Direkt ansehen' }).waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: 'Live-TV jetzt' }).waitFor();
    await page.screenshot({ path: join(SHOTS, '01-start-desktop.png') });
  });

  await check('Suche → Detailseite → echte Quelle → Video spielt', async () => {
    await page.getByRole('searchbox', { name: 'Suche' }).fill('Big Buck');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/suche\?q=/);
    await page.getByRole('link', { name: /Big Buck Bunny/ }).first().click();
    await page.getByRole('heading', { level: 1, name: 'Big Buck Bunny' }).waitFor();
    assert(await page.getByText('▶ Direkt ansehen').first().isVisible(), 'Badge fehlt');
    await page.getByRole('button', { name: '▶ Direkt ansehen' }).click();
    await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1.5, null, { timeout: 20000 });
    await page.screenshot({ path: join(SHOTS, '02-detail-player.png') });
  });

  await check('Fortschritt wird gespeichert → „Weiterschauen“ nach Neuladen', async () => {
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.currentTime = 12;
      v.pause();
    });
    await page.waitForTimeout(500);
    await page.goto(BASE + '/');
    await page.reload();
    await page.getByRole('heading', { name: 'Weiterschauen' }).waitFor({ timeout: 10000 });
  });

  await check('Merkliste bleibt nach Neuladen erhalten', async () => {
    await page.goto(BASE + '/titel/' + encodeURIComponent('tmdb:movie:603'));
    await page.getByRole('heading', { level: 1, name: 'Matrix' }).waitFor();
    await page.getByRole('button', { name: '+ Merkliste' }).click();
    await page.reload();
    await page.getByRole('button', { name: '✓ Auf der Merkliste' }).waitFor();
    await page.goto(BASE + '/merkliste');
    await page.getByRole('link', { name: 'Matrix' }).first().waitFor();
    await page.getByText('Zuletzt angesehen').waitFor();
  });

  await check('Externe Angebote und Trailer korrekt gekennzeichnet', async () => {
    await page.goto(BASE + '/titel/' + encodeURIComponent('tmdb:movie:603'));
    await page.getByText('Netflix').waitFor();
    assert(await page.getByText('Abo erforderlich').first().isVisible(), 'Abo-Badge fehlt');
    assert((await page.getByText('Trailer', { exact: true }).count()) > 0, 'Trailer-Kennzeichnung fehlt');
    assert((await page.getByRole('button', { name: '▶ Direkt ansehen' }).count()) === 0, 'Direkt ansehen darf nicht erscheinen');
  });

  await check('Serie: Staffeln & Episoden', async () => {
    await page.goto(BASE + '/titel/' + encodeURIComponent('tmdb:tv:1399'));
    await page.getByRole('tab', { name: /Staffel 1/ }).waitFor();
    await page.getByText('Erste Folge').waitFor();
    await page.getByRole('tab', { name: /Staffel 2/ }).click();
    await page.getByText('Neue Staffel').waitFor();
    assert((await page.getByText('Erste Folge').count()) === 0, 'Episode falscher Staffel sichtbar');
    await page.screenshot({ path: join(SHOTS, '03-serie.png'), fullPage: true });
  });

  await check('Filter Filme: Genre + „nur direkt ansehen“', async () => {
    await page.goto(BASE + '/filme?avail=direct&genre=silent');
    await page.getByRole('link', { name: /Nosferatu/ }).waitFor();
    assert((await page.locator('.grid .card').count()) === 1, 'Filter liefert falsche Anzahl');
    await page.goto(BASE + '/filme?q=xyzunbekannt&avail=direct');
    await page.getByText('Keine Titel gefunden').waitFor();
  });

  await check('Live-TV: offizieller HLS-Stream spielt (hls.js, Qualitätsauswahl)', async () => {
    await page.goto(BASE + '/live');
    await page.getByRole('link', { name: /^DW/ }).first().click();
    await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1.5, null, { timeout: 25000 });
    const opts = await page.getByLabel('Qualität').locator('option').allTextContents();
    assert(opts.includes('360p') && opts.includes('240p'), `Qualitätsstufen fehlen: ${opts}`);
    await page.getByLabel('Qualität').selectOption({ label: '240p' });
    await page.screenshot({ path: join(SHOTS, '04-live-player.png') });
  });

  await check('Live-TV: gesperrter Stream → verständliche Fehlermeldung', async () => {
    await page.goto(BASE + '/live/tagesschau24.de');
    await page.getByRole('alert').getByText(/Geosperre|verweigert/).waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(SHOTS, '05-stream-fehler.png') });
  });

  await check('Live-TV: Drittanbieter-Stream (SRF zwei) nicht abspielbar', async () => {
    await page.goto(BASE + '/live/SRFzwei.ch');
    await page.getByText('Kein geprüfter Stream für deine Region.').waitFor();
  });

  await check('Live-TV: Filter Land/Kategorie', async () => {
    await page.goto(BASE + '/live?playable=0&country=CH&category=news');
    await page.locator('.channel-card').first().waitFor();
    const flags = await page.locator('.channel-card .card-sub').allTextContents();
    assert(flags.every((f) => f.includes('Schweiz')), 'Länderfilter falsch');
  });

  await check('Einstellungen: Region bleibt nach Neuladen', async () => {
    await page.goto(BASE + '/einstellungen');
    await page.getByRole('combobox', { name: 'Region' }).selectOption('DE');
    await page.reload();
    assert((await page.getByRole('combobox', { name: 'Region' }).inputValue()) === 'DE', 'Region nicht gespeichert');
    await page.goto(BASE + '/live/ZDF.de');
    await page.locator('video').waitFor();
    await page.goto(BASE + '/einstellungen');
    await page.getByRole('combobox', { name: 'Region' }).selectOption('CH');
  });

  await check('YouTube: ganzer Film eines offiziellen Kanals → Einbettungsplayer, als „Ganzer Film“ gekennzeichnet', async () => {
    await page.goto(BASE + '/filme?avail=direct&q=bergdoktor');
    await page.getByRole('link', { name: /Der Bergdoktor/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Der Bergdoktor' }).waitFor();
    await page.getByRole('button', { name: '▶ Direkt ansehen' }).click();
    const frame = page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/nk1AAAAAAAA"]');
    await frame.waitFor();
    await page.locator('.tag-film').waitFor();
    assert((await page.locator('.player .tag-trailer').count()) === 0, 'Film fälschlich als Trailer markiert');
    assert((await frame.contentFrame().getByText('Testplatzhalter').count()) === 1, 'iframe nicht geladen');
    await page.screenshot({ path: join(SHOTS, '08-youtube-film.png') });
  });

  await check('YouTube: in CH gesperrtes Video nicht abspielbar', async () => {
    await page.goto(BASE + '/titel/' + encodeURIComponent('youtube:movie:nk4AAAAAAAA'));
    await page.getByRole('heading', { level: 1, name: 'In CH gesperrt' }).waitFor();
    assert((await page.getByRole('button', { name: '▶ Direkt ansehen' }).count()) === 0, 'Direkt ansehen trotz Sperre');
    assert(await page.getByRole('button', { name: '▶ Abspielen' }).isDisabled(), 'Abspielen nicht deaktiviert');
  });

  await check('Quellen-Seite zeigt Status', async () => {
    await page.goto(BASE + '/quellen');
    await page.getByRole('cell', { name: 'iptv-org' }).waitFor();
    await page.screenshot({ path: join(SHOTS, '06-quellen.png'), fullPage: true });
  });

  await check('Schlüssel nicht im ausgelieferten JavaScript', async () => {
    const html = await (await fetch(BASE + '/')).text();
    const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    for (const s of scripts) assert(!(await (await fetch(BASE + s)).text()).includes('test-secret-token'), 'Schlüssel im Bundle!');
    const api = await (await fetch(BASE + '/api/title/tmdb:movie:603')).text();
    assert(!api.includes('test-secret-token'), 'Schlüssel in API-Antwort!');
  });

  await check('Keine JavaScript-Fehler', async () => assert(consoleErrors.length === 0, consoleErrors.join(' | ')));
  await ctx.close();

  // ---------- Mobil ----------
  const mctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
  await setupRoutes(mctx);
  const m = await mctx.newPage();
  for (const [name, url, waitText] of [
    ['start', '/', 'Direkt ansehen'],
    ['filme', '/filme', 'Filme'],
    ['detail', '/titel/' + encodeURIComponent('tmdb:movie:10378'), 'Big Buck Bunny'],
    ['live', '/live', 'Live-TV'],
  ]) {
    await check(`Mobil (390px): ${name} ohne horizontales Scrollen`, async () => {
      await m.goto(BASE + url);
      await m.getByRole('heading', { name: waitText }).first().waitFor({ timeout: 15000 });
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `Seite ${overflow}px zu breit`);
      assert(await m.locator('.tabbar').isVisible(), 'Tab-Leiste fehlt');
      await m.screenshot({ path: join(SHOTS, `07-mobil-${name}.png`), fullPage: false });
    });
  }
  await check('Mobil: Video spielt', async () => {
    await m.goto(BASE + '/titel/' + encodeURIComponent('tmdb:movie:10378'));
    await m.getByRole('button', { name: '▶ Direkt ansehen' }).click();
    await m.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1, null, { timeout: 20000 });
  });
  await mctx.close();
} finally {
  await browser.close();
  server.kill();
}

for (const [s, n] of results) console.log(`${s.padEnd(7)} ${n}`);
const failed = results.filter((r) => r[0] !== 'OK').length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
