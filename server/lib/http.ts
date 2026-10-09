import type { z } from 'zod';
import { config } from '../config.ts';
import { markError, markOk } from './status.ts';
import type { ProviderId } from '../../shared/types.ts';

export class UpstreamError extends Error {
  constructor(
    public provider: ProviderId,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchOptions<T> {
  provider: ProviderId;
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  method?: 'GET' | 'POST';
  body?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/** Wartezeit aus Retry-After (Sekunden oder Datum), begrenzt auf 5 s. */
function retryAfterMs(res: Response, fallback: number): number {
  const h = res.headers.get('retry-after');
  if (!h) return fallback;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 5000);
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), 5000) : fallback;
}

/**
 * JSON von einer externen API laden: Zeitlimit, begrenzte Wiederholungen
 * (Netzwerkfehler, 429, 502–504) mit exponentiellem Backoff und
 * Schema-Validierung der Antwort.
 */
export async function fetchJson<T>(url: string, opts: FetchOptions<T>): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const backoff = 400 * 2 ** attempt;
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { Accept: 'application/json', 'User-Agent': config.userAgent, ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < retries) {
          await sleep(retryAfterMs(res, backoff));
          continue;
        }
        const err = new UpstreamError(opts.provider, `HTTP ${res.status}`, res.status);
        markError(opts.provider, err.message);
        throw err;
      }
      const json: unknown = await res.json();
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        const msg = `Unerwartetes Antwortformat: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        markError(opts.provider, msg);
        throw new UpstreamError(opts.provider, msg);
      }
      markOk(opts.provider);
      return parsed.data;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      lastErr = err;
      if (attempt < retries) {
        await sleep(backoff);
        continue;
      }
    }
  }
  const msg =
    lastErr instanceof Error
      ? lastErr.name === 'TimeoutError'
        ? 'Zeitüberschreitung'
        : `Netzwerkfehler: ${lastErr.message}${lastErr.cause instanceof Error ? ` (${lastErr.cause.message})` : ''}`
      : 'Unbekannter Fehler';
  markError(opts.provider, msg);
  throw new UpstreamError(opts.provider, msg);
}

/** Einfache Nebenläufigkeitsbegrenzung (wie p-limit), um API-Limits zu schonen. */
export function limitConcurrency(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async function run<R>(fn: () => Promise<R>): Promise<R> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}
