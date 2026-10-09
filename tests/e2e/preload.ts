/**
 * NUR für den Browser-Test: ersetzt die externen APIs durch nachgebildete
 * Antworten (die Testumgebung hat keinen Zugang zu TMDB, Wikidata usw.).
 * Start: node --import tsx --import ./tests/e2e/preload.ts server/index.ts
 */
import { installMockFetch, TEST_KEY, YT_TEST_KEY } from '../mockFetch.ts';

process.env.TMDB_READ_ACCESS_TOKEN = TEST_KEY;
process.env.YOUTUBE_API_KEY = YT_TEST_KEY;
process.env.PORT ??= '8799';
installMockFetch();
console.log('[e2e] Externe APIs werden nachgebildet (Testmodus)');
