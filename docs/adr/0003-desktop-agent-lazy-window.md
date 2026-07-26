# Mode A desktop agent launches with no window until opened

`apps/mode-a-desktop` (ADR-0002) is meant to auto-launch at login and run continuously in the
background — closer to Mode A's "invisible background agent" (§3.1) than a normal app a user
opens and closes. Electron's idle memory cost comes almost entirely from keeping a Renderer
process (a live Chromium `BrowserWindow`) alive: real tray apps that do this (Discord,
Microsoft Teams) idle around ~1GB RAM. The Main process alone — plain Node — is comparatively
cheap, close to the footprint `packages/engine`'s existing CLI spike already has.

## Decision

At login, only the Main process starts. It owns `packages/engine`'s lifecycle directly (swarm
connection, manifest sync, seeding) and shows a tray icon; no `BrowserWindow` is created until
the user clicks the tray icon to open the UI.

## Why

This process is meant to sit in the background on a student's laptop indefinitely. Keeping its
idle cost close to a plain Node process matters far more than saving the beat of load time a
lazily-created window costs on open.

## Consequences

Engine state has to live in the Main process, not a renderer-owned store — the renderer may
not exist yet when engine events (new manifest, download progress, peer connect) happen.
Opening the tray icon creates a fresh `BrowserWindow` that hydrates from the Main process's
live state, not the other way around.
