import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin in both dev and prod, so no CORS/cookie config is ever
// needed: in dev, Vite proxies API paths to mode-b-api; in prod, this
// build's output is served as static assets by mode-b-api itself
// (@fastify/static — see apps/mode-b-api/src/server.ts).
const API_TARGET = process.env.MODE_B_API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': API_TARGET,
      '/courses': API_TARGET,
      '/content': API_TARGET
    }
  }
})
