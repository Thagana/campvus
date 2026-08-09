import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentrySourcemapPlugin, sourcemapsEnabled } from './vite.sentry-plugin';

// https://vitejs.dev/config
export default defineConfig({
  build: { sourcemap: sourcemapsEnabled },
  plugins: [react(), ...sentrySourcemapPlugin()],
});
