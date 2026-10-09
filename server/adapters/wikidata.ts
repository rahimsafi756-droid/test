/**
 * Wikidata + Wikimedia Commons: Filme mit Videodatei (P10) auf Commons und
 * belegter Freigabe – entweder freie Lizenz (P275, z. B. Creative Commons)
 * oder Urheberrechtsstatus "gemeinfrei" (P6216 = Q19652) mit Rechtsraum (P1001).
 * Die Videodateien liegen auf upload.wikimedia.org (Commons verlangt freie Lizenzen).
 *
 * SPARQL: https://query.wikidata.org/  ·  Commons-API: https://commons.wikimedia.org/w/api.php
 * Wikimedia verlangt einen aussagekräftigen User-Agent (CONTACT in .env).
 */
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import type { PlaybackSource } from '../../shared/types.ts';
import { normalizeGenres } from '../../shared/genres.ts';
import type { FreeTitle } from './free.ts';

const HOUR = 3600_000;

export const wikidataInfo = {
  id: 'wikidata' as const,
  name: 'Wikidata + Wikimedia Commons',
  purpose: 'Gemeinfreie und frei lizenzierte Filme mit Videodatei auf Commons',
  keyRequired: false,
};

export const wikidataEnabled = () => config.isEnabled('wikidata');

/** Wikidata-Items der Rechtsräume → ISO-Code */
const JURISDICTION: Record<string, string> = {
  Q39: 'CH',
  Q30: 'US',
  Q183: 'DE',
  Q40: 'AT',
  Q142: 'FR',
  Q38: 'IT',
  Q347: 'LI',
  Q145: 'GB',
};
/** Wikidata-Item "weltweit" */
const WORLDWIDE = 'Q13780930';

const QUERY = `
SELECT ?film (SAMPLE(?lbl) AS ?label) (SAMPLE(?desc) AS ?description) (SAMPLE(?video) AS ?videoFile)
       (MIN(?date) AS ?pub) (SAMPLE(?tmdb) AS ?tmdbId) (SAMPLE(?poster) AS ?posterFile) (SAMPLE(?dur) AS ?duration)
       (SAMPLE(?langCode) AS ?lang)
       (GROUP_CONCAT(DISTINCT ?licLbl; separator="|") AS ?licenses)
       (GROUP_CONCAT(DISTINCT ?jur; separator="|") AS ?pdJurisdictions)
       (GROUP_CONCAT(DISTINCT ?genreLbl; separator="|") AS ?genres)
       (GROUP_CONCAT(DISTINCT ?dirLbl; separator="|") AS ?directors)
WHERE {
  VALUES ?type { wd:Q11424 wd:Q24862 wd:Q202866 wd:Q226730 }
  ?film wdt:P31 ?type ; wdt:P10 ?video .
  OPTIONAL { ?film wdt:P275 ?license . ?license rdfs:label ?licLbl . FILTER(LANG(?licLbl) = "en") }
  OPTIONAL {
    ?film p:P6216 ?st . ?st ps:P6216 wd:Q19652 .
    OPTIONAL { ?st pq:P1001 ?jurItem }
    BIND(IF(BOUND(?jurItem), STRAFTER(STR(?jurItem), "entity/"), "none") AS ?jur)
  }
  FILTER(BOUND(?licLbl) || BOUND(?jur))
  OPTIONAL { ?film rdfs:label ?lbl . FILTER(LANG(?lbl) = "de") }
  OPTIONAL { ?film schema:description ?desc . FILTER(LANG(?desc) = "de") }
  OPTIONAL { ?film wdt:P577 ?date }
  OPTIONAL { ?film wdt:P4947 ?tmdb }
  OPTIONAL { ?film wdt:P3383 ?poster }
  OPTIONAL { ?film wdt:P2047 ?dur }
  OPTIONAL { ?film wdt:P364/wdt:P218 ?langCode }
  OPTIONAL { ?film wdt:P136 ?genre . ?genre rdfs:label ?genreLbl . FILTER(LANG(?genreLbl) = "de") }
  OPTIONAL { ?film wdt:P57 ?dir . ?dir rdfs:label ?dirLbl . FILTER(LANG(?dirLbl) = "de" || LANG(?dirLbl) = "en") }
}
GROUP BY ?film
LIMIT 1500`;

const binding = z.object({ value: z.string() });
const sparqlSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        film: binding,
        label: binding.optional(),
        description: binding.optional(),
        videoFile: binding,
        pub: binding.optional(),
        tmdbId: binding.optional(),
        posterFile: binding.optional(),
        duration: binding.optional(),
        lang: binding.optional(),
        licenses: binding.optional(),
        pdJurisdictions: binding.optional(),
        genres: binding.optional(),
        directors: binding.optional(),
      }),
    ),
  }),
});

const FREE_LICENSE = /creative commons|^cc[ -]|cc0|public domain|gnu free documentation/i;

/** Commons-Dateiname aus einer Special:FilePath-URI. */
export function commonsFileName(uri: string): string {
  const raw = uri.split('/Special:FilePath/')[1] ?? uri.split('/').pop() ?? '';
  return decodeURIComponent(raw).replace(/_/g, ' ');
}

const filePath = (name: string, width?: number) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/ /g, '_'))}${width ? `?width=${width}` : ''}`;

/** Leitet Lizenz und Rechtsräume einer Zeile ab. Exportiert für Tests. */
export function classifyRights(licenses: string[], jurisdictions: string[]) {
  const free = licenses.filter((l) => FREE_LICENSE.test(l));
  if (free.length) {
    return { regions: 'worldwide' as const, licenseName: free.join(', '), basis: 'Freie Lizenz laut Wikidata (P275); Datei auf Wikimedia Commons' };
  }
  if (jurisdictions.includes(WORLDWIDE)) {
    return { regions: 'worldwide' as const, licenseName: 'Gemeinfrei (weltweit)', basis: 'Urheberrechtsstatus "gemeinfrei" mit Rechtsraum "weltweit" laut Wikidata (P6216)' };
  }
  const codes = jurisdictions.map((j) => JURISDICTION[j]).filter((c): c is string => Boolean(c));
  const unspecified = jurisdictions.includes('none');
  return {
    regions: codes,
    licenseName: codes.length ? `Gemeinfrei in: ${codes.join(', ')}` : 'Gemeinfrei (Rechtsraum nicht angegeben)',
    basis: `Urheberrechtsstatus "gemeinfrei" laut Wikidata (P6216)${codes.length ? ` für ${codes.join(', ')}` : ''}${unspecified ? '; teils ohne Rechtsraum-Angabe' : ''}`,
    regionNote: codes.length ? undefined : 'Für welche Länder die Gemeinfreiheit gilt, ist in Wikidata nicht angegeben – daher nicht als direkt abspielbar markiert.',
  };
}

const commonsSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        title: z.string(),
        missing: z.boolean().optional(),
        videoinfo: z
          .array(
            z.object({
              url: z.string(),
              mime: z.string(),
              width: z.number().optional(),
              height: z.number().optional(),
              derivatives: z.array(z.object({ src: z.string(), type: z.string(), height: z.number().optional(), shorttitle: z.string().optional(), title: z.string().optional() })).optional(),
              extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

async function commonsSources(fileName: string, base: Omit<PlaybackSource, 'id' | 'kind' | 'url' | 'label' | 'mimeType' | 'quality' | 'availableInRegion'>): Promise<Omit<PlaybackSource, 'availableInRegion'>[]> {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'videoinfo',
    titles: `File:${fileName}`,
    viprop: 'url|mime|size|derivatives|extmetadata',
    viextmetadatafilter: 'LicenseShortName|LicenseUrl',
  }).toString();
  const data = await cache.wrap(`commons:${fileName}`, 12 * HOUR, () => fetchJson(u.toString(), { provider: 'wikidata', schema: commonsSchema }));
  const info = data.query.pages[0]?.videoinfo?.[0];
  if (!info) return [];
  const meta = info.extmetadata ?? {};
  const commonsLicense = typeof meta.LicenseShortName?.value === 'string' ? meta.LicenseShortName.value : undefined;
  const commonsLicenseUrl = typeof meta.LicenseUrl?.value === 'string' ? meta.LicenseUrl.value : undefined;
  const license = base.license && {
    ...base.license,
    basis: `${base.license.basis}${commonsLicense ? `; Lizenz laut Commons-Datei: ${commonsLicense}` : ''}`,
    url: base.license.url ?? commonsLicenseUrl,
  };
  // Transkodierte Fassungen (WebM VP9) in mehreren Auflösungen + Original
  const derivs = (info.derivatives ?? [])
    .filter((d) => /^video\//.test(d.type) && d.src.startsWith('https://'))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const picked = new Map<number, (typeof derivs)[0]>();
  for (const d of derivs) if (d.height && !picked.has(d.height) && d.height <= 1080) picked.set(d.height, d);
  const list: Omit<PlaybackSource, 'availableInRegion'>[] = [...picked.values()].slice(0, 3).map((d) => ({
    ...base,
    license,
    id: `commons:${fileName}:${d.height}`,
    kind: 'file',
    url: d.src,
    mimeType: d.type,
    label: `Wikimedia Commons ${d.height}p`,
    quality: `${d.height}p`,
  }));
  if (!list.length && info.url.startsWith('https://')) {
    list.push({ ...base, license, id: `commons:${fileName}:orig`, kind: 'file', url: info.url, mimeType: info.mime, label: 'Wikimedia Commons (Original)', quality: info.height ? `${info.height}p` : undefined });
  }
  return list;
}

export async function wikidataFreeTitles(): Promise<FreeTitle[]> {
  return cache.wrap('wikidata:films', 12 * HOUR, async () => {
    const u = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(QUERY)}`;
    const data = await fetchJson(u, {
      provider: 'wikidata',
      schema: sparqlSchema,
      headers: { Accept: 'application/sparql-results+json' },
      timeoutMs: 55_000,
      retries: 1,
    });
    const checkedAt = new Date().toISOString();
    return data.results.bindings.map((b): FreeTitle => {
      const qid = b.film.value.split('/').pop() ?? b.film.value;
      const fileName = commonsFileName(b.videoFile.value);
      const rights = classifyRights(b.licenses?.value.split('|').filter(Boolean) ?? [], b.pdJurisdictions?.value.split('|').filter(Boolean) ?? []);
      const tmdb = b.tmdbId && /^\d+$/.test(b.tmdbId.value) ? Number(b.tmdbId.value) : undefined;
      const rawGenres = b.genres?.value.split('|').filter(Boolean) ?? [];
      const license = { name: rights.licenseName, url: `https://www.wikidata.org/wiki/${qid}`, basis: rights.basis, trust: 'structured' as const };
      const homepage = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, '_'))}`;
      const dur = b.duration ? Number(b.duration.value) : undefined;
      return {
        summary: {
          id: `wikidata:movie:${qid}`,
          kind: 'movie',
          title: b.label?.value ?? fileName.replace(/\.[a-z0-9]+$/i, ''),
          year: b.pub ? Number(b.pub.value.slice(0, 4)) || undefined : undefined,
          overview: b.description?.value,
          posterUrl: b.posterFile ? filePath(commonsFileName(b.posterFile.value), 400) : undefined,
          genres: normalizeGenres(rawGenres).length ? normalizeGenres(rawGenres) : rawGenres.slice(0, 3),
          originalLanguage: b.lang?.value,
          provider: 'wikidata',
        },
        tmdbId: tmdb,
        trust: 'structured',
        license,
        regions: rights.regions,
        regionNote: rights.regionNote,
        homepage,
        // P2047 ist meist in Minuten angegeben; unplausible Werte ignorieren
        runtimeMin: dur && dur > 0 && dur < 600 ? Math.round(dur) : undefined,
        directors: b.directors?.value.split('|').filter(Boolean),
        loadSources: () =>
          commonsSources(fileName, {
            isTrailer: false,
            provider: 'wikidata',
            providerName: 'Wikimedia Commons',
            regions: rights.regions,
            regionNote: rights.regionNote,
            license,
            embed: 'allowed',
            embedNote: 'Freie Lizenz bzw. gemeinfrei – Weiterverbreitung erlaubt (Lizenzbedingungen wie Namensnennung beachten)',
            homepage,
            checkedAt,
          }),
      };
    });
  });
}
