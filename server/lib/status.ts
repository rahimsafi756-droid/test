import type { ProviderId } from '../../shared/types.ts';

interface Entry {
  lastOkAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

const state = new Map<ProviderId, Entry>();

export function markOk(p: ProviderId) {
  const e = state.get(p) ?? {};
  e.lastOkAt = new Date().toISOString();
  e.lastError = undefined;
  state.set(p, e);
}

export function markError(p: ProviderId, msg: string) {
  const e = state.get(p) ?? {};
  e.lastError = msg;
  e.lastErrorAt = new Date().toISOString();
  state.set(p, e);
}

export function getStatus(p: ProviderId): Entry {
  return state.get(p) ?? {};
}
