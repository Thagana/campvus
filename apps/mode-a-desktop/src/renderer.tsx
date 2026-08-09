/**
 * Runs in the "renderer" context. State lives in the main process
 * (ADR-0003) — this window hydrates via `window.campvus.getState()` on
 * load and stays current via `onStateChange`, rather than owning any
 * engine state itself.
 */

// Auto-installs GlobalHandlers (window.onerror + unhandledrejection) by
// default — do not hand-roll those, it would double-capture. Takes no DSN;
// events relay to the main process, which is the only place SENTRY_DSN is
// read (see observability.ts).
import * as Sentry from '@sentry/electron/renderer'
Sentry.init()

import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@campvus/design/index.css'
import './index.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
