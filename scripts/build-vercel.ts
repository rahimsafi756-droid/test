/**
 * Erzeugt einen Vercel-Build nach der "Build Output API" (Version 3):
 *   .vercel/output/static/        → gebautes Frontend (dist/)
 *   .vercel/output/functions/api.func/  → API als eine gebündelte Node.js-Funktion
 *   .vercel/output/config.json    → Routen, Sicherheits-Header, SPA-Fallback
 * Doku: https://vercel.com/docs/build-output-api/v3
 * Aufruf: npm run build:vercel
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = '.vercel/output';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/functions/api.func`, { recursive: true });

// 1) Frontend
cpSync('dist', `${OUT}/static`, { recursive: true });

// 2) API-Funktion bündeln (inkl. iptv-Abzug)
await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${OUT}/functions/api.func/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
writeFileSync(
  `${OUT}/functions/api.func/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);

// 3) Routen und Header (gleiche Content-Security-Policy wie der Node-Server)
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  'frame-src https://www.youtube-nocookie.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');
const config = {
  version: 3,
  routes: [
    {
      src: '/(.*)',
      headers: {
        'Content-Security-Policy': csp,
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      },
      continue: true,
    },
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '/api/(.*)', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    // SPA-Fallback: alle übrigen Pfade liefern die App
    { src: '/(.*)', dest: '/index.html' },
  ],
};
writeFileSync(`${OUT}/config.json`, JSON.stringify(config, null, 2));
console.log('Vercel-Build erstellt in .vercel/output');
