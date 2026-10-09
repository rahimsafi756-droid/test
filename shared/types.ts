/**
 * Einheitliches Datenmodell für Rahim Cinema.
 * Wird von Server (Adapter/Services) und Frontend gemeinsam genutzt.
 */

/** Wie ein Titel bzw. Sender in der gewählten Region verfügbar ist. */
export type Availability = 'direct' | 'free_provider' | 'subscription' | 'buy_rent' | 'none';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  direct: 'Direkt ansehen',
  free_provider: 'Kostenlos beim Anbieter',
  subscription: 'Abo erforderlich',
  buy_rent: 'Kaufen/Mieten',
  none: 'Keine Quelle verfügbar',
};

/** Reihenfolge für "beste" Verfügbarkeit (kleiner = besser für Nutzer). */
export const AVAILABILITY_RANK: Record<Availability, number> = {
  direct: 0,
  free_provider: 1,
  subscription: 2,
  buy_rent: 3,
  none: 4,
};

export type ProviderId = 'tmdb' | 'tvmaze' | 'wikidata' | 'archive' | 'iptv';

export type MediaKind = 'movie' | 'series';

/**
 * Vertrauensstufe einer Lizenz-/Freigabeangabe.
 * - curated: von Hand geprüfte Regel (z. B. offizielle Sender-CDN)
 * - structured: strukturierte, belegte Angabe (z. B. Wikidata-Lizenzaussage + Commons)
 * - declared: Lizenz nur durch Uploader erklärt (z. B. Internet Archive "licenseurl")
 */
export type TrustLevel = 'curated' | 'structured' | 'declared';

/** strict = nur curated + structured, extended = zusätzlich declared */
export type TrustMode = 'strict' | 'extended';

export type PlaybackKind = 'hls' | 'file' | 'youtube';

export interface LicenseInfo {
  name: string;
  url?: string;
  /** Wie die Freigabe belegt ist – wird in der Oberfläche angezeigt. */
  basis: string;
  trust: TrustLevel;
}

export interface PlaybackSource {
  id: string;
  kind: PlaybackKind;
  url: string;
  mimeType?: string;
  label: string;
  isTrailer: boolean;
  provider: ProviderId;
  providerName: string;
  /** ISO-3166-Ländercodes, in denen die Quelle nutzbar ist, oder 'worldwide'. */
  regions: string[] | 'worldwide';
  /** True, wenn die Quelle in der angefragten Region laut Daten nutzbar ist. */
  availableInRegion: boolean;
  regionNote?: string;
  license?: LicenseInfo;
  /** Ob die Einbettung durch Dritte ausdrücklich erlaubt ist. */
  embed: 'allowed' | 'unclear';
  embedNote?: string;
  /** Offizielle Seite (Sender/Archiv), immer als Alternative verlinkt. */
  homepage?: string;
  quality?: string;
  /** Zeitpunkt der letzten automatischen/kuratierten Prüfung der Daten (ISO). */
  checkedAt: string;
  /** Untertitel-Spuren (WebVTT), falls die Quelle sie anbietet. */
  subtitles?: { label: string; lang: string; url: string }[];
}

/** Angebot eines externen Anbieters (aus TMDB/JustWatch). Wird nur verlinkt. */
export interface ProviderOffer {
  providerName: string;
  logoUrl?: string;
  availability: Exclude<Availability, 'direct' | 'none'>;
  /** "mit Werbung" etc. */
  note?: string;
}

export interface TitleSummary {
  id: string;
  kind: MediaKind;
  title: string;
  originalTitle?: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres: string[];
  originalLanguage?: string;
  rating?: number;
  availability: Availability;
  /** false = Verfügbarkeit konnte nicht ermittelt werden (z. B. API-Fehler) */
  availabilityKnown: boolean;
  provider: ProviderId;
}

export interface CastMember {
  name: string;
  role?: string;
  photoUrl?: string;
}

export interface SeasonSummary {
  number: number;
  name: string;
  episodeCount?: number;
  airDate?: string;
  posterUrl?: string;
  /** Anbieter-interne ID (z. B. TVmaze-Staffel-ID) */
  ref?: string;
}

export interface Episode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  runtimeMin?: number;
  stillUrl?: string;
  sources: PlaybackSource[];
}

export interface SeasonDetail {
  seriesId: string;
  number: number;
  name: string;
  overview?: string;
  episodes: Episode[];
}

export interface Provenance {
  provider: ProviderId;
  name: string;
  url?: string;
  fetchedAt: string;
}

export interface TitleDetail extends TitleSummary {
  runtimeMin?: number;
  tagline?: string;
  cast: CastMember[];
  directors: string[];
  sources: PlaybackSource[];
  trailers: PlaybackSource[];
  offers: ProviderOffer[];
  /** Link zur Anbieter-Übersicht (TMDB/JustWatch) für die Region */
  offersLink?: string;
  offersRegion: string;
  seasons?: SeasonSummary[];
  homepage?: string;
  provenance: Provenance[];
  notices: Notice[];
}

export interface Channel {
  id: string;
  name: string;
  logoUrl?: string;
  country: string;
  countryName?: string;
  countryFlag?: string;
  languages: string[];
  categories: string[];
  website?: string;
  streams: PlaybackSource[];
  availability: Availability;
  /** Anzahl Streams in iptv-org, die mangels Prüfung ausgeblendet wurden */
  hiddenUnverifiedStreams: number;
}

export interface Notice {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalResults?: number;
  notices: Notice[];
}

export interface SourceStatus {
  id: ProviderId;
  name: string;
  purpose: string;
  configured: boolean;
  enabled: boolean;
  keyRequired: boolean;
  lastOkAt?: string;
  lastError?: string;
}

export interface Facet {
  value: string;
  label: string;
  count?: number;
}

export interface LiveMeta {
  countries: Facet[];
  languages: Facet[];
  categories: Facet[];
  dataOrigin: 'live' | 'snapshot';
  updatedAt: string;
  notices: Notice[];
}

export interface HomeRow {
  id: string;
  title: string;
  subtitle?: string;
  items: TitleSummary[];
  link?: string;
}

export interface HomeData {
  rows: HomeRow[];
  channels: Channel[];
  notices: Notice[];
}

export type SortKey = 'popularity' | 'newest' | 'oldest' | 'title' | 'rating';

export type AvailabilityFilter = 'all' | 'free' | 'direct';

export interface GenreDef {
  key: string;
  label: string;
}
