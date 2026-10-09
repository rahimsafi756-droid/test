/**
 * Kuratierte offizielle YouTube-Kanäle, die ganze Filme mit Lizenz der
 * Rechteinhaber kostenlos (werbefinanziert) bzw. unter freier Lizenz anbieten.
 *
 * Aufnahmekriterien:
 * - Kanal wird vom Rechteinhaber/Lizenznehmer betrieben (Betreiber benannt),
 * - Betreiber erklärt öffentlich, die Titel lizenziert zu haben, ODER die Filme stehen unter freier Lizenz,
 * - Einbettung wird pro Video über den YouTube-Status "embeddable" geprüft (automatisch).
 *
 * Kanal-IDs/Handles wurden am 09.10.2026 per Websuche recherchiert (siehe evidence).
 * Bitte vor dem Livebetrieb einmal auf YouTube öffnen und prüfen.
 */
export interface YoutubeChannel {
  key: string;
  name: string;
  /** Kanal-ID (UC…) – bevorzugt */
  channelId?: string;
  /** Alternativ der @Handle, wird über channels.list?forHandle aufgelöst */
  handle?: string;
  operator: string;
  /** Wie die Lizenz belegt ist */
  licenseBasis: string;
  licenseName: string;
  language?: string;
  /** Mindestlaufzeit in Minuten, damit nur ganze Filme (keine Trailer/Clips) erscheinen */
  minMinutes: number;
  /** Optional: Titel muss diesem Muster entsprechen */
  titleInclude?: RegExp;
  /** Titel, die ausgeschlossen werden */
  titleExclude?: RegExp;
  homepage: string;
  evidence: string[];
  checkedAt: string;
}

const CHECKED = '2026-10-09';
const NOT_FILMS = /trailer|teaser|clip|making[- ]of|behind the scenes|featurette|interview|#shorts|tutorial|livestream/i;

export const YOUTUBE_CHANNELS: YoutubeChannel[] = [
  {
    key: 'netzkino',
    name: 'Netzkino',
    channelId: 'UCGkHFrwE8KEuOHPVsIOskAg',
    operator: 'PLAION PICTURES GmbH',
    licenseName: 'Vom Rechteinhaber lizenziert (werbefinanziert)',
    licenseBasis: 'Offizieller Kanal von Netzkino; der Betreiber PLAION PICTURES GmbH gibt an, alle Titel bei den Rechteinhabern lizenziert zu haben.',
    language: 'de',
    minMinutes: 60,
    titleExclude: NOT_FILMS,
    homepage: 'https://www.netzkino.de',
    evidence: ['https://vidiq.com/youtube-stats/channel/UCGkHFrwE8KEuOHPVsIOskAg', 'https://www.kino.de/artikel/filme-auf-netzkino--6wwmg8vjhw'],
    checkedAt: CHECKED,
  },
  {
    key: 'moviedome',
    name: 'Moviedome',
    handle: '@Moviedome',
    operator: 'PLAION PICTURES GmbH',
    licenseName: 'Vom Rechteinhaber lizenziert (werbefinanziert)',
    licenseBasis: 'Offizieller, verifizierter Kanal der Marke Moviedome (PLAION PICTURES GmbH).',
    language: 'de',
    minMinutes: 60,
    titleExclude: NOT_FILMS,
    homepage: 'https://www.youtube.com/@Moviedome',
    evidence: ['https://www.netzwelt.de/tv-sender/moviedome.html', 'https://www.youtube.com/@Moviedome'],
    checkedAt: CHECKED,
  },
  {
    key: 'moviedome-it',
    name: 'Moviedome IT',
    handle: '@MoviedomeIT',
    operator: 'PLAION PICTURES GmbH',
    licenseName: 'Vom Rechteinhaber lizenziert (werbefinanziert)',
    licenseBasis: 'Offizieller italienischsprachiger Kanal der Marke Moviedome (PLAION PICTURES GmbH).',
    language: 'it',
    minMinutes: 60,
    titleExclude: NOT_FILMS,
    homepage: 'https://www.youtube.com/@MoviedomeIT',
    evidence: ['https://www.youtube.com/@MoviedomeIT/about'],
    checkedAt: CHECKED,
  },
  {
    key: 'blender-studio',
    name: 'Blender Studio',
    channelId: 'UCz75RVbH8q2jdBJ4SnwuZZQ',
    operator: 'Blender Studio (Blender Foundation)',
    licenseName: 'Creative Commons BY (Open Movies)',
    licenseBasis: 'Die Open Movies des Blender Studios erscheinen unter Creative-Commons-Lizenz (z. B. Sprite Fright: CC BY 4.0).',
    language: 'en',
    minMinutes: 3,
    titleInclude: /open movie/i,
    titleExclude: NOT_FILMS,
    homepage: 'https://studio.blender.org/films/',
    evidence: ['https://socialblade.com/youtube/handle/blenderstudio', 'https://studio.blender.org/blog/sprite-fright-premiere'],
    checkedAt: CHECKED,
  },
];
