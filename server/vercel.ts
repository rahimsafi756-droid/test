/**
 * Einstiegspunkt für Vercel (Serverless-Funktion, Node.js).
 * Wird von scripts/build-vercel.ts zu einer einzelnen Datei gebündelt.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { app } from './app.ts';

const listener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Vercel leitet /api/<pfad> per Rewrite auf /api?__path=<pfad> um → ursprünglichen Pfad wiederherstellen
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('__path');
  if (path !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `/api/${path}${qs ? `?${qs}` : ''}`;
  }
  return listener(req, res);
}
