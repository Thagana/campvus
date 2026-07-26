import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // hyperswarm's dependency tree (udx-native, sodium-native, etc.) ships
      // native .node addons Vite can't bundle — leave it as a real
      // `require()`, resolved by Node at runtime. @campvus/engine itself is
      // pure TS with extensionless relative imports (fine under `tsx`, but
      // not under Node's own ESM resolver) — bundle it like our own source.
      external: ['hyperswarm'],
    },
  },
});
