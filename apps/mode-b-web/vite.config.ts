import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin in both dev and prod, so no CORS/cookie config is ever
// needed: in dev, Vite proxies API paths to mode-b-api; in prod, this
// build's output is served as static assets by mode-b-api itself
// (@fastify/static — see apps/mode-b-api/src/server.ts).
const API_TARGET = process.env.MODE_B_API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // pnpm's hoisted node-linker (see pnpm-workspace.yaml) can leave a
    // second physical copy of react/react-dom nested under a dependency
    // (e.g. better-auth) even when the version matches ours — React's hook
    // dispatcher lives on a module singleton, so two copies means hooks
    // called from the dependency's copy see a null dispatcher ("Invalid
    // hook call"). Force every resolution to our single copy.
    dedupe: ['react', 'react-dom']
  },
  server: {
    proxy: {
      '/api/auth': API_TARGET,
      '/courses': API_TARGET,
      '/content': API_TARGET,
      '/admin': API_TARGET
    }
  }
})
