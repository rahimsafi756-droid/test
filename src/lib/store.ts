/**
 * Lokale Speicherung (ohne Registrierung): Einstellungen, Merkliste,
 * zuletzt angesehen und Wiedergabefortschritt – alles im localStorage.
 */
import { useSyncExternalStore } from 'react';
import type { MediaKind, TrustMode } from '../../shared/types.ts';

export interface Settings {
  region: string;
  language: 'de-CH' | 'de-DE' | 'fr-CH' | 'it-CH' | 'en-US';
  trust: TrustMode;
}

export interface SavedItem {
  id: string;
  kind: MediaKind | 'channel';
  title: string;
  posterUrl?: string;
  year?: number;
  href: string;
  savedAt: number;
}

export interface Progress {
  key: string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  href: string;
  position: number;
  duration: number;
  updatedAt: number;
}

interface State {
  settings: Settings;
  watchlist: SavedItem[];
  history: SavedItem[];
  progress: Record<string, Progress>;
}

const KEY = 'rahim-cinema:v1';
const DEFAULTS: State = {
  settings: { region: 'CH', language: 'de-CH', trust: 'strict' },
  watchlist: [],
  history: [],
  progress: {},
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
    };
  } catch {
    return DEFAULTS;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Speicher voll oder gesperrt (privater Modus) – App funktioniert weiter */
  }
  listeners.forEach((l) => l());
}

// Änderungen aus anderen Tabs übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getSettings = () => state.settings;

export const actions = {
  updateSettings(patch: Partial<Settings>) {
    commit({ ...state, settings: { ...state.settings, ...patch } });
  },
  toggleWatchlist(item: Omit<SavedItem, 'savedAt'>) {
    const exists = state.watchlist.some((w) => w.id === item.id);
    commit({
      ...state,
      watchlist: exists ? state.watchlist.filter((w) => w.id !== item.id) : [{ ...item, savedAt: Date.now() }, ...state.watchlist],
    });
  },
  addHistory(item: Omit<SavedItem, 'savedAt'>) {
    const rest = state.history.filter((h) => h.id !== item.id);
    commit({ ...state, history: [{ ...item, savedAt: Date.now() }, ...rest].slice(0, 40) });
  },
  clearHistory() {
    commit({ ...state, history: [] });
  },
  saveProgress(p: Omit<Progress, 'updatedAt'>) {
    const progress = { ...state.progress, [p.key]: { ...p, updatedAt: Date.now() } };
    // Fertig angesehene Inhalte (letzte 3 %) aus "Weiterschauen" entfernen
    if (p.duration > 0 && p.position / p.duration > 0.97) delete progress[p.key];
    // Höchstens 50 Einträge behalten
    const entries = Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
    commit({ ...state, progress: Object.fromEntries(entries.map((e) => [e.key, e])) });
  },
  removeProgress(key: string) {
    const progress = { ...state.progress };
    delete progress[key];
    commit({ ...state, progress });
  },
  resetAll() {
    commit(DEFAULTS);
  },
};

export const getProgress = (key: string): Progress | undefined => state.progress[key];
