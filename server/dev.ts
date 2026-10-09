/** Entwicklungsserver: API (Hono) + Vite mit Hot-Reload auf einem Port. */
import { createServer as createVite } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { createServer } from 'node:http';
import { app } from './app.ts';
import { config } from './config.ts';

const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
const api = getRequestListener(app.fetch);

createServer((req, res) => {
  if (req.url?.startsWith('/api/')) return api(req, res);
  vite.middlewares(req, res);
}).listen(config.port, () => {
  console.log(`Rahim Cinema (Entwicklung) auf http://localhost:${config.port}`);
});
