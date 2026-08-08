import path from 'node:path';
import { defineConfig } from 'vite';
import { config as loadDotenv } from 'dotenv';
import { sentrySourcemapPlugin, sourcemapsEnabled } from './vite.sentry-plugin';

// A packaged, double-clicked app has no shell-inherited env and no .env
// file inside the asar — SENTRY_DSN has to be baked into the bundled main.js
// at electron-forge make time, same as CI's SENTRY_DSN secret below. Local
// dev picks it up from this app's own .env (gitignored, per-developer).
loadDotenv({ path: path.resolve(__dirname, '.env') });

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: sourcemapsEnabled,
    rollupOptions: {
      // hyperswarm's dependency tree (udx-native, sodium-native, etc.) ships
      // native .node addons Vite can't bundle — leave it as a real
      // `require()`, resolved by Node at runtime. @campvus/engine itself is
      // pure TS with extensionless relative imports (fine under `tsx`, but
      // not under Node's own ESM resolver) — bundle it like our own source.
      external: ['hyperswarm'],
    },
  },
  define: {
    'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
  },
  plugins: [...sentrySourcemapPlugin()],
});
