import fs from 'fs'
import path from 'path'
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Same-origin in both dev and prod, so no CORS/cookie config is ever
// needed: in dev, Vite proxies API paths to mode-b-api; in prod, this
// build's output is served as static assets by mode-b-api itself
// (@fastify/static — see apps/mode-b-api/src/server.ts).
const API_TARGET = process.env.MODE_B_API_URL || 'http://localhost:3000'

// Mirrors server.ts's explicit GET '/' -> landing.html route so the
// marketing page is what a bare `vite dev` root shows too, not just the
// production build — the SPA (index.html) is still reachable at every
// other path (e.g. /login), same as prod.
function landingAtRoot (): Plugin {
  return {
    name: 'landing-at-root',
    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(fs.readFileSync(path.join(__dirname, 'public', 'landing.html')))
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), landingAtRoot()],
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
      '/admin': API_TARGET,
      '/school': API_TARGET
    }
  }
})
