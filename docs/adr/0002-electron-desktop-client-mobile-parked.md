# Park the mobile companion app; ship an Electron desktop client for Mode A instead

ADR-0001 set the Mode A companion app's shape (A2, standalone) but not its runtime. We
investigated Expo/React Native as that runtime and confirmed it doesn't work: Hyperswarm and
HyperDHT depend on native C++/NAPI bindings (`sodium-native`, `utp-native`) that don't exist
in Expo's managed workflow at all, and only run in a bare React Native project by embedding a
full Node.js runtime on-device via [nodejs-mobile](https://github.com/JaneaSystems/nodejs-mobile)
— hand-compiled per architecture, with no iOS simulator support (physical device required for
every test). That's a substantial, separate engineering project, not an incremental step on
top of `apps/campvus`.

## Decision

Park the mobile companion app for now — `apps/campvus` (the Expo scaffold) stays in the repo,
unwired, as a placeholder for when mobile is picked back up. Ship an **Electron desktop
client** (`apps/mode-a-desktop`) as Mode A's near-term companion instead. Electron just wraps
`packages/engine` directly: the engine already runs Hyperswarm/Hypercore natively on Node with
no native-mobile complications, which is exactly the laptop-to-laptop path the pilot has
already validated (§13, Open Question #4).

## Why

Desktop/laptop is where the engine already works today, and it still serves the problem
statement (§1) — campus students do most coursework-material downloading on laptops, often
over the same metered/mobile-hotspot connections the architecture targets, not exclusively on
phones. This lets Mode A ship a real companion now instead of blocking on the mobile-native
integration project.

## Consequences

Mobile is deferred, not abandoned — re-opening this decision means picking a mobile runtime
strategy (bare RN + nodejs-mobile, or reconsidering Bare/Pear) as its own project. Until then,
`apps/mode-a-desktop` is the actual Mode A companion referenced in §3.1, §10, and §11.
