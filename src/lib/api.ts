import { useCallback, useEffect, useState } from 'react';
import { getSettings, useStore } from './store.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Ruft die eigene API auf und hängt Region, Sprache und Prüfmodus an. */
export async function api<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const s = getSettings();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ region: s.region, language: s.language, trust: s.trust, ...params })) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}?${qs.toString()}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Keine Verbindung zum Server. Bitte Internetverbindung prüfen.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Fehler ${res.status}`, res.status);
  return body as T;
}

export interface Loadable<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  reload: () => void;
}

/** Lädt Daten und lädt bei geänderten Parametern oder Einstellungen neu. */
export function useApi<T>(path: string | null, params: Record<string, string | number | undefined> = {}): Loadable<T> {
  const settings = useStore((s) => s.settings);
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: path !== null });
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([path, params, settings]);

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    api<T>(path, params, ctrl.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setState({ loading: false, error: e instanceof ApiError ? e : new ApiError(String(e), 0) });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
