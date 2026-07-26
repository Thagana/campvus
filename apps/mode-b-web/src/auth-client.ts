// Same-origin in both dev (via Vite's proxy) and prod (served by
// mode-b-api itself) — see vite.config.ts — so no baseURL is needed here.
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export type User = { id: string, email: string }
