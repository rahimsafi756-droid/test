import type { LicenseInfo, PlaybackSource, TitleSummary, TrustLevel } from '../../shared/types.ts';

/**
 * Gemeinsames Format der Adapter für frei abspielbare Titel (Wikidata/Commons,
 * Internet Archive). Die Verfügbarkeit wird pro Anfrage aus Region und
 * Vertrauensmodus berechnet (services/catalog.ts).
 */
export interface FreeTitle {
  summary: Omit<TitleSummary, 'availability' | 'availabilityKnown'>;
  tmdbId?: number;
  trust: TrustLevel;
  license: LicenseInfo;
  /** Länder, für die die Freigabe belegt ist, oder 'worldwide' (z. B. CC-Lizenz). */
  regions: string[] | 'worldwide';
  regionNote?: string;
  homepage: string;
  runtimeMin?: number;
  directors?: string[];
  /** Lädt die konkreten Videodateien erst bei Bedarf (Detailseite). */
  loadSources(): Promise<Omit<PlaybackSource, 'availableInRegion'>[]>;
}

export function regionAllowed(regions: string[] | 'worldwide', region: string): boolean {
  return regions === 'worldwide' || regions.includes(region);
}
