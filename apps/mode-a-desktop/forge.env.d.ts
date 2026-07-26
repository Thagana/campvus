/// <reference types="vite/client" />

// Hand-rolled instead of
// `/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />`:
// that reference type-imports from the package's own unbuilt
// `src/Config.ts` (no compiled .d.ts ships for it in @electron-forge/plugin-vite@7.11.2),
// which fails to typecheck under this project's strict Node16 module
// resolution — an upstream packaging gap, not something to work around by
// loosening our own config. The only things from that reference this
// project actually uses are these two build-time globals (see src/main.ts);
// its `declare module 'vite'` augmentation isn't needed since none of the
// vite.*.config.ts files are in this package's tsconfig `include`.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string
