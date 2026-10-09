import type { GenreDef } from './types.ts';

/**
 * Kanonische Genre-Liste. TMDB-IDs laut /genre/movie/list und /genre/tv/list,
 * TVmaze- und Wikidata/Archive-Begriffe werden über Stichwörter zugeordnet.
 */
export interface GenreMapping extends GenreDef {
  tmdbMovie?: number;
  tmdbTv?: number;
  /** Kleingeschriebene Stichwörter (EN/DE) für TVmaze, Wikidata und Internet Archive */
  keywords: string[];
}

export const GENRES: GenreMapping[] = [
  { key: 'action', label: 'Action', tmdbMovie: 28, tmdbTv: 10759, keywords: ['action', 'actionfilm'] },
  { key: 'adventure', label: 'Abenteuer', tmdbMovie: 12, tmdbTv: 10759, keywords: ['adventure', 'abenteuer', 'abenteuerfilm'] },
  { key: 'animation', label: 'Animation', tmdbMovie: 16, tmdbTv: 16, keywords: ['animation', 'anime', 'animationsfilm', 'zeichentrick', 'cartoon', 'animated'] },
  { key: 'comedy', label: 'Komödie', tmdbMovie: 35, tmdbTv: 35, keywords: ['comedy', 'komödie', 'filmkomödie', 'slapstick'] },
  { key: 'crime', label: 'Krimi', tmdbMovie: 80, tmdbTv: 80, keywords: ['crime', 'krimi', 'kriminalfilm', 'film noir', 'noir'] },
  { key: 'documentary', label: 'Dokumentarfilm', tmdbMovie: 99, tmdbTv: 99, keywords: ['documentary', 'dokumentarfilm', 'dokumentation', 'educational', 'ephemeral films'] },
  { key: 'drama', label: 'Drama', tmdbMovie: 18, tmdbTv: 18, keywords: ['drama', 'filmdrama'] },
  { key: 'family', label: 'Familie', tmdbMovie: 10751, tmdbTv: 10751, keywords: ['family', 'familie', 'familienfilm', 'children', 'kinderfilm'] },
  { key: 'fantasy', label: 'Fantasy', tmdbMovie: 14, tmdbTv: 10765, keywords: ['fantasy', 'fantasyfilm'] },
  { key: 'history', label: 'Historie', tmdbMovie: 36, keywords: ['history', 'historie', 'historienfilm', 'historical'] },
  { key: 'horror', label: 'Horror', tmdbMovie: 27, keywords: ['horror', 'horrorfilm'] },
  { key: 'music', label: 'Musik', tmdbMovie: 10402, keywords: ['music', 'musik', 'musikfilm', 'musical'] },
  { key: 'mystery', label: 'Mystery', tmdbMovie: 9648, tmdbTv: 9648, keywords: ['mystery', 'thriller'] },
  { key: 'romance', label: 'Liebesfilm', tmdbMovie: 10749, keywords: ['romance', 'liebesfilm', 'romantic'] },
  { key: 'scifi', label: 'Science-Fiction', tmdbMovie: 878, tmdbTv: 10765, keywords: ['science-fiction', 'science fiction', 'sci-fi', 'science-fiction-film'] },
  { key: 'thriller', label: 'Thriller', tmdbMovie: 53, keywords: ['thriller'] },
  { key: 'war', label: 'Krieg', tmdbMovie: 10752, tmdbTv: 10768, keywords: ['war', 'krieg', 'kriegsfilm'] },
  { key: 'western', label: 'Western', tmdbMovie: 37, tmdbTv: 37, keywords: ['western'] },
  { key: 'silent', label: 'Stummfilm', keywords: ['silent film', 'stummfilm', 'silent'] },
];

export function genreByKey(key: string | undefined): GenreMapping | undefined {
  return key ? GENRES.find((g) => g.key === key) : undefined;
}

/** Ordnet freie Genre-Begriffe (z. B. "Science Fiction", "Stummfilm") kanonischen Labels zu. */
export function normalizeGenres(raw: string[]): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const v = r.toLowerCase().trim();
    for (const g of GENRES) {
      if (g.keywords.some((k) => v === k || v.includes(k))) out.add(g.label);
    }
  }
  return [...out];
}

/** Sprachen für Filter (ISO 639-1) */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Französisch' },
  { code: 'it', label: 'Italienisch' },
  { code: 'en', label: 'Englisch' },
  { code: 'es', label: 'Spanisch' },
  { code: 'ja', label: 'Japanisch' },
  { code: 'ko', label: 'Koreanisch' },
  { code: 'sv', label: 'Schwedisch' },
  { code: 'da', label: 'Dänisch' },
  { code: 'tr', label: 'Türkisch' },
];

export const REGIONS: { code: string; label: string }[] = [
  { code: 'CH', label: 'Schweiz' },
  { code: 'DE', label: 'Deutschland' },
  { code: 'AT', label: 'Österreich' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'FR', label: 'Frankreich' },
  { code: 'IT', label: 'Italien' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'Vereinigtes Königreich' },
];

export const UI_LANGUAGES: { code: string; label: string }[] = [
  { code: 'de-CH', label: 'Deutsch (Schweiz)' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-CH', label: 'Französisch (Schweiz)' },
  { code: 'it-CH', label: 'Italienisch (Schweiz)' },
  { code: 'en-US', label: 'Englisch' },
];
