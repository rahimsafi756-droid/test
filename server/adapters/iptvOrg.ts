/**
 * iptv-org-Adapter (https://github.com/iptv-org/api, Daten: Unlicense).
 * Lädt Sender, Feeds, Logos, Streams, Kategorien, Sprachen, Länder und die
 * Sperrliste (DMCA/NSFW). Ist die API nicht erreichbar, wird ein mitgelieferter
 * Daten-Abzug (server/data/iptv-snapshot.json) verwendet.
 *
 * Wichtig: Die Daten sind ein Verzeichnis, keine Rechte-Datenbank. Abspielbar
 * werden nur Streams, die eine Regel in data/official-streams.ts erfüllen.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.ts';
import { cache } from '../lib/cache.ts';
import { fetchJson } from '../lib/http.ts';
import { markError } from '../lib/status.ts';

export const iptvInfo = {
  id: 'iptv' as const,
  name: 'iptv-org',
  purpose: 'Senderverzeichnis (Logos, Länder, Sprachen, Kategorien) und Stream-Kandidaten',
  keyRequired: false,
};

export const iptvEnabled = () => config.isEnabled('iptv');

const nullStr = z.string().nullish();
export const iptvSchemas = {
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      country: z.string(),
      categories: z.array(z.string()).default([]),
      is_nsfw: z.boolean().default(false),
      closed: nullStr,
      website: nullStr,
    }),
  ),
  feeds: z.array(z.object({ channel: z.string(), id: z.string(), is_main: z.boolean().default(false), languages: z.array(z.string()).default([]) })),
  logos: z.array(z.object({ channel: z.string(), feed: nullStr, url: z.string(), width: z.number().nullish(), in_use: z.boolean().optional() })),
  streams: z.array(z.object({ channel: nullStr, feed: nullStr, title: z.string().optional(), url: z.string(), referrer: nullStr, user_agent: nullStr, quality: nullStr, labels: z.array(z.string()).default([]) })),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  languages: z.array(z.object({ code: z.string(), name: z.string() })),
  countries: z.array(z.object({ code: z.string(), name: z.string(), flag: z.string().optional() })),
  blocklist: z.array(z.object({ channel: z.string(), reason: z.string() })),
};

export type IptvData = { [K in keyof typeof iptvSchemas]: z.infer<(typeof iptvSchemas)[K]> } & {
  origin: 'live' | 'snapshot';
  updatedAt: string;
};

const SNAPSHOT = fileURLToPath(new URL('../data/iptv-snapshot.json', import.meta.url));

function loadSnapshot(): IptvData {
  if (!existsSync(SNAPSHOT)) throw new Error('Kein iptv-Snapshot vorhanden');
  const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Record<string, unknown>;
  const out: Record<string, unknown> = { origin: 'snapshot', updatedAt: String(raw.generatedAt ?? '') };
  for (const [k, schema] of Object.entries(iptvSchemas)) out[k] = schema.parse(raw[k] ?? []);
  return out as IptvData;
}

/** Lädt alle iptv-org-Daten (12 h gecacht, bei Ausfall Snapshot). */
export async function loadIptv(): Promise<IptvData> {
  return cache.wrap('iptv:all', 12 * 3600_000, async () => {
    try {
      const entries = await Promise.all(
        (Object.keys(iptvSchemas) as (keyof typeof iptvSchemas)[]).map(async (k) => {
          const data = await fetchJson(`${config.iptvApiBase}/${k}.json`, { provider: 'iptv', schema: iptvSchemas[k] as z.ZodType<unknown>, timeoutMs: 30_000, retries: 1 });
          return [k, data] as const;
        }),
      );
      return { ...Object.fromEntries(entries), origin: 'live', updatedAt: new Date().toISOString() } as IptvData;
    } catch (err) {
      markError('iptv', `API nicht erreichbar, verwende Snapshot (${err instanceof Error ? err.message : String(err)})`);
      return loadSnapshot();
    }
  });
}
