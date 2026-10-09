/** Produktionsserver: liefert das gebaute Frontend (dist/) und die API aus. */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { app } from './app.ts';
import { config } from './config.ts';

if (!existsSync('dist/index.html')) {
  console.error('dist/ fehlt – bitte zuerst "npm run build" ausführen.');
  process.exit(1);
}
const indexHtml = readFileSync('dist/index.html', 'utf8');

app.use('/assets/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
});
app.use('/*', serveStatic({ root: './dist' }));
// SPA-Fallback: alle übrigen Pfade liefern index.html
app.get('*', (c) => c.html(indexHtml));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Rahim Cinema läuft auf http://localhost:${info.port}`);
});
