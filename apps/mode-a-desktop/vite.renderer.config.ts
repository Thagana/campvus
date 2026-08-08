import { defineConfig } from 'vite';
import { sentrySourcemapPlugin, sourcemapsEnabled } from './vite.sentry-plugin';

// https://vitejs.dev/config
export default defineConfig({
  build: { sourcemap: sourcemapsEnabled },
  plugins: [...sentrySourcemapPlugin()],
});
