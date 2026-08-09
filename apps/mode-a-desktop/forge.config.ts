import fs from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// The app has no i18n — Chromium's bundled locale .pak files (~46MB across
// 55 languages) are pure dead weight. Keep only en-US, the locale Electron
// falls back to when a requested locale's .pak is missing.
const KEPT_LOCALES = new Set(['en-US.pak']);

// vite.main.config.ts leaves `hyperswarm` as a real require() (its dependency
// tree ships native .node addons Vite can't bundle). In dev that require()
// resolves fine because pnpm's `nodeLinker: hoisted` setting hoists it up to
// the monorepo root node_modules and Node's resolver walks up to find it —
// but electron-packager only copies this app's own directory, so the
// packaged app shipped with no node_modules at all and crashed at launch
// with "Cannot find module 'hyperswarm'". Walk the same directories Node's
// resolver would, and copy the whole runtime dependency closure in ourselves.
async function findPackageDir (name: string, fromDir: string): Promise<string> {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`Cannot resolve package "${name}" from ${fromDir}`);
      dir = parent;
    }
  }
}

async function copyDependencyClosure (rootDir: string, destNodeModules: string, names: string[]): Promise<void> {
  const copied = new Set<string>();
  async function copyOne (name: string, fromDir: string, optional: boolean): Promise<void> {
    if (copied.has(name)) return;
    copied.add(name);
    let pkgDir: string;
    try {
      pkgDir = await findPackageDir(name, fromDir);
    } catch (err) {
      // Optional deps (e.g. platform-specific native prebuild fallbacks) may
      // genuinely not be installed on this machine/platform — skip those.
      if (optional) return;
      throw err;
    }
    await fs.cp(pkgDir, path.join(destNodeModules, name), { recursive: true });
    const pkgJson = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'));
    await Promise.all([
      ...Object.keys(pkgJson.dependencies ?? {}).map((dep) => copyOne(dep, pkgDir, false)),
      ...Object.keys(pkgJson.optionalDependencies ?? {}).map((dep) => copyOne(dep, pkgDir, true)),
    ]);
  }
  await Promise.all(names.map((name) => copyOne(name, rootDir, false)));
}

// hyperswarm's dependency tree (udx-native, sodium-native, ...) ships
// prebuildify-style `prebuilds/<platform>-<arch>/*.node` binaries for every
// platform it supports, but copyDependencyClosure above copies each
// package's directory wholesale. Each CI job only packages for its own host
// platform/arch, so the other prebuilds are dead weight — and on Linux,
// rpmbuild's auto-strip pass chokes trying to strip foreign-format binaries
// (e.g. android-arm) it doesn't recognize, failing the whole rpm build.
async function pruneForeignPrebuilds (destNodeModules: string, platform: string, arch: string): Promise<void> {
  const keep = `${platform}-${arch}`;
  async function walk (dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const full = path.join(dir, entry.name);
      if (entry.name === 'prebuilds') {
        const variants = await fs.readdir(full);
        await Promise.all(
          variants
            .filter((variant) => variant !== keep)
            .map((variant) => fs.rm(path.join(full, variant), { recursive: true, force: true }))
        );
        return;
      }
      await walk(full);
    }));
  }
  await walk(destNodeModules);
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Base name (no extension) — electron-packager appends .ico on Windows,
    // .icns on macOS, and falls back to icon.png on Linux. Source SVGs live
    // in packages/design/assets (the canonical brand mark); these rasters
    // are generated from that same "C" ring geometry as the tray icon.
    icon: './assets/icon',
    // `icon` above only sets the packaged exe/app-bundle's OS-level icon
    // metadata — it doesn't put the file anywhere runtime code can read it.
    // main.ts's BrowserWindow `icon` option (the taskbar/titlebar icon)
    // needs assets/icon.png available at `process.resourcesPath` too.
    extraResource: ['./assets'],
    // electron-packager names the app binary after `productName` ("campvus"),
    // but the Linux deb/rpm installers (electron-installer-debian/-redhat)
    // look for a binary matching package.json's `name` ("campvus-p2p") —
    // without this they fail with "could not find the Electron app binary".
    executableName: 'campvus-p2p',
    afterCopy: [
      async (buildPath, _electronVersion, _platform, _arch, callback) => {
        // `buildPath` here is `<staging>/resources/app` — the flat
        // Chromium `locales/` dir lives two levels up, as a sibling of
        // `resources/`.
        const localesDir = path.join(buildPath, '..', '..', 'locales');
        try {
          const files = await fs.readdir(localesDir);
          await Promise.all(
            files
              .filter((file) => !KEPT_LOCALES.has(file))
              .map((file) => fs.rm(path.join(localesDir, file)))
          );
          callback();
        } catch (err) {
          // No flat `locales` dir on this platform/layout (e.g. macOS) —
          // nothing to prune.
          callback();
        }
      },
      async (buildPath, _electronVersion, platform, arch, callback) => {
        try {
          const destNodeModules = path.join(buildPath, 'node_modules');
          await copyDependencyClosure(__dirname, destNodeModules, ['hyperswarm']);
          await pruneForeignPrebuilds(destNodeModules, platform, arch);
          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // hyperswarm's dependency tree ships native .node addons — asar can't
    // dlopen a binary from inside the archive, so they must be unpacked.
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
