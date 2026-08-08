// Shared by all three Vite configs (main/preload/renderer) so the release
// tag matches exactly what observability.ts's Sentry.init({ release }) uses
// at runtime, without tripling this config across files.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { name: string; version: string };

// Gates `build.sourcemap` in all three Vite configs, not just the plugin's
// own `disable` flag below — the plugin's `filesToDeleteAfterUpload` cleanup
// only runs as part of its upload step, which it skips entirely when
// disabled. Generating sourcemaps unconditionally would leave them sitting
// on disk with no cleanup, and electron-packager would ship them inside the
// asar (bigger install, exposes source) even on a build that never uploads
// anything. Tying generation itself to token presence keeps "no token" a
// true no-op, same as the plugin's own `disable` flag.
export const sourcemapsEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

// disable: true when SENTRY_AUTH_TOKEN is absent — same no-op discipline as
// observability.ts's SENTRY_DSN guard, so a build with no token configured
// (local dev, forked-PR CI) behaves like the plugin was never added.
export function sentrySourcemapPlugin (): ReturnType<typeof sentryVitePlugin> {
  return sentryVitePlugin({
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disable: !process.env.SENTRY_AUTH_TOKEN,
    release: { name: `${pkg.name}@${pkg.version}` },
    sourcemaps: {
      // Uploaded sourcemaps must never ship inside the packaged app — bigger
      // install, exposes source.
      filesToDeleteAfterUpload: ['.vite/**/*.map'],
    },
  });
}
