import { describe, expect, it } from 'vitest';
import { classifyRights, commonsFileName } from '../server/adapters/wikidata.ts';
import { licenseFromUrl } from '../server/adapters/internetArchive.ts';
import { offersFrom } from '../server/adapters/tmdb.ts';
import { stripHtml } from '../server/adapters/tvmaze.ts';
import { TtlCache } from '../server/lib/cache.ts';

describe('Rechte- und Lizenzlogik', () => {
  it('Wikidata: freie Lizenz gilt weltweit', () => {
    expect(classifyRights(['Creative Commons Attribution 3.0 Unported'], []).regions).toBe('worldwide');
    expect(classifyRights(['proprietary license'], []).regions).toEqual([]);
  });
  it('Wikidata: Gemeinfreiheit nur für angegebene Rechtsräume', () => {
    expect(classifyRights([], ['Q30']).regions).toEqual(['US']);
    expect(classifyRights([], ['Q39', 'Q183']).regions).toEqual(['CH', 'DE']);
    const none = classifyRights([], ['none']);
    expect(none.regions).toEqual([]);
    expect(none.regionNote).toBeTruthy();
  });
  it('Commons-Dateiname aus Special:FilePath', () => {
    expect(commonsFileName('http://commons.wikimedia.org/wiki/Special:FilePath/Big%20Buck%20Bunny%204K.webm')).toBe('Big Buck Bunny 4K.webm');
  });
  it('Internet Archive: nur CC/PD-Lizenz-URLs', () => {
    expect(licenseFromUrl('http://creativecommons.org/publicdomain/mark/1.0/')).toBe('Public Domain Mark');
    expect(licenseFromUrl('https://creativecommons.org/licenses/by-nc/3.0/')).toBe('CC BY-NC 3.0');
    expect(licenseFromUrl('https://example.org/license')).toBeUndefined();
    expect(licenseFromUrl(undefined)).toBeUndefined();
  });
  it('Anbieter: beste Verfügbarkeit (kostenlos > Abo > Kauf)', () => {
    expect(offersFrom({ buy: [{ provider_name: 'A' }], flatrate: [{ provider_name: 'B' }] }).best).toBe('subscription');
    expect(offersFrom({ ads: [{ provider_name: 'C' }], rent: [{ provider_name: 'D' }] }).best).toBe('free_provider');
    expect(offersFrom(undefined).best).toBe('none');
  });
  it('HTML wird entfernt', () => {
    expect(stripHtml('<p>Hallo <b>Welt</b> &amp; Co.</p>')).toBe('Hallo Welt & Co.');
  });
  it('Cache liefert bei Ausfall den letzten guten Wert', async () => {
    const c = new TtlCache(10, 60_000);
    await c.wrap('k', 1, async () => 'alt');
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.wrap('k', 1, async () => { throw new Error('down'); })).toBe('alt');
  });
});
