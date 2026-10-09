interface Slot<T> {
  value: T;
  expires: number;
}

/**
 * Speicher-Cache mit Ablaufzeit, Grössenbegrenzung, Zusammenlegen gleichzeitiger
 * Anfragen und "stale-if-error": Fällt eine Quelle aus, wird der letzte gute
 * Wert (bis zu staleMs nach Ablauf) weiterverwendet.
 */
export class TtlCache {
  private store = new Map<string, Slot<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private maxEntries = 2000,
    private staleMs = 24 * 3600_000,
  ) {}

  get<T>(key: string): T | undefined {
    const s = this.store.get(key);
    if (s && s.expires > Date.now()) return s.value as T;
    return undefined;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = (async () => {
      try {
        const v = await fn();
        this.set(key, v, ttlMs);
        return v;
      } catch (err) {
        const stale = this.store.get(key);
        if (stale && stale.expires + this.staleMs > Date.now()) return stale.value as T;
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}

export const cache = new TtlCache();
