import type { ProviderId } from '../shared/types.ts';

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

const disabled = new Set(
  (env('DISABLED_SOURCES') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const config = {
  port: Number(env('PORT') ?? 8787),
  tmdbReadToken: env('TMDB_READ_ACCESS_TOKEN'),
  tmdbApiKey: env('TMDB_API_KEY'),
  youtubeApiKey: env('YOUTUBE_API_KEY'),
  iptvApiBase: (env('IPTV_API_BASE') ?? 'https://iptv-org.github.io/api').replace(/\/$/, ''),
  iaCollections: (env('IA_COLLECTIONS') ?? 'feature_films,prelinger')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_.-]+$/.test(s)),
  userAgent: `RahimCinema/0.1 (${env('PUBLIC_URL') ?? 'http://localhost'}; ${env('CONTACT') ?? 'kein Kontakt angegeben'})`,
  isEnabled(id: ProviderId): boolean {
    return !disabled.has(id);
  },
};

export type Config = typeof config;
