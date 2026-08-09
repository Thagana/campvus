import { app, BrowserWindow, Tray, nativeImage, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import * as Sentry from '@sentry/electron/main';
import { updateElectronApp } from 'update-electron-app';
import { networkAwareSeedingPolicy, alwaysAllowSeeding, createSwarmNode, httpOriginFetcher, httpManifestListFetcher, hasContent, SwarmNode } from '@campvus/engine';
import { createAgent, AgentEngineEvents, Agent } from './agent';
import { createWindowController } from './window-controller';
import { selectDesktopSeedingPolicy } from './seeding-policy-selection';
import { configureAutoLaunch } from './auto-launch';
import { getPaths } from './paths';
import { loadConfigFile, saveConfigFile, mergeConfig, validateConfig, DesktopConfig, PartialDesktopConfig } from './config-store';
import { nodeRequest, NodeResponse } from './node-request';
import { initMainObservability, updateLogger } from './observability';
import type { AppState, SaveConfigResult, LoginModeBArgs, LoginModeBResult, CourseFile, OpenCourseFileResult } from './preload-api';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Before anything else that could throw — after Squirrel's own early-quit
// concern above, which isn't Sentry's to delay or risk.
initMainObservability();

// No-ops in dev (!app.isPackaged) and on Linux (Squirrel has no Linux
// build, and update-electron-app only supports darwin/win32) — deb/rpm
// installs keep updating manually/via their package manager, same as any
// other Linux desktop app. Points at Electron's free hosted update service
// (update.electronjs.org), which reads this public repo's GitHub Releases —
// exactly what .github/workflows/desktop-ci.yml already publishes
// (.nupkg/RELEASES, .zip) on every pushed `vX.Y.Z` tag.
updateElectronApp({
  repo: 'Thagana/campvus',
  logger: updateLogger,
});

// ADR-0004: apps/mode-a-desktop seeds freely by default (network-aware
// opt-out for a tethered/metered connection), not the Wi-Fi-only-by-default
// rule the parked mobile client would use.
const seedingPolicy = selectDesktopSeedingPolicy({
  networkAware: networkAwareSeedingPolicy,
  alwaysAllow: alwaysAllowSeeding,
});

// Gap #12 (docs/TODO.md): env vars alone left a misconfigured install
// silently stuck with no way to fix it short of relaunching with different
// env vars. Env vars are still read here, but only as first-run defaults —
// config-store.ts persists whatever's actually in effect to disk, and the
// window's Settings panel can change it (and restart the engine) without
// relaunching the app at all.
// A student is normally enrolled in several courses at once — comma
// separated, same convention as the CLI shim's positional <courseIds> arg.
const envCourseIds = process.env.CAMPVUS_COURSE_IDS
  ?.split(',').map((id) => id.trim()).filter((id) => id.length > 0);

const envDefaults: PartialDesktopConfig = {
  courseIds: envCourseIds && envCourseIds.length > 0 ? envCourseIds : undefined,
  institutionPublicKeyHex: process.env.CAMPVUS_INSTITUTION_PUBLIC_KEY,
  originUrl: process.env.CAMPVUS_ORIGIN_URL,
  manifestOriginUrl: process.env.CAMPVUS_MANIFEST_ORIGIN_URL,
  region: process.env.CAMPVUS_REGION,
  maxStoreBytes: process.env.CAMPVUS_MAX_STORE_BYTES ? Number(process.env.CAMPVUS_MAX_STORE_BYTES) : undefined,
};

// §5.5's "opportunistically on Wi-Fi + charging" periodic check-in,
// approximated here as a fixed interval — the desktop app is long-running
// (unlike the CLI shim, which only syncs once per invocation), so a
// configured manifest origin gets a real periodic re-check, not just a
// one-shot at launch.
const MANIFEST_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Surfaces "not configured yet" as the same tray error state a real engine
// error would produce, instead of leaving the agent stuck on a misleading
// 'idle' with no explanation.
function unconfiguredEngineEvents (message: string): AgentEngineEvents {
  return {
    onSyncStart: () => {},
    onSyncEnd: () => {},
    onPeerCountChange: () => {},
    onError: (handler) => handler(new Error(message)),
  };
}

const paths = getPaths();
const configFile = path.join(paths.rootDir, 'desktop-config.json');

let swarmNode: SwarmNode | undefined;
let agent: Agent;
let currentConfig: DesktopConfig;

function wireAgent (nextAgent: Agent): void {
  agent = nextAgent;
  agent.onStateChange(() => {
    refreshTray();
    windowContents?.send('campvus:state-changed', getAppState());
  });
  agent.onError((err) => { Sentry.captureException(err); });
}

// Builds the swarm node (or the unconfigured stand-in) for a given config
// without starting any networking — kept separate from starting so the
// original ADR-0003 timing holds: the node is constructed eagerly at module
// load, but .start() is still deferred to app.on('ready').
// A live apps/mode-b-api origin gates both /content/:hash and
// /courses/:courseId/manifests behind a session (Open Question #9(a)) —
// an LMS origin (the other thing originUrl/manifestOriginUrl can point at)
// has no such requirement, so this is undefined unless a Mode B login
// actually happened.
function authHeaders (config: DesktopConfig): Record<string, string> | undefined {
  return config.modeBToken ? { Authorization: `Bearer ${config.modeBToken}` } : undefined;
}

// Separate from MANIFEST_SYNC_INTERVAL_MS (which the engine itself uses to
// catch up on published manifests) — this re-checks the student's own
// enrollment against a live Mode B server, so a course added after sign-in
// gets picked up without the student re-entering their password. Mode A's
// manual-config path has no equivalent since there's no server to ask.
const COURSE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let courseRefreshTimer: NodeJS.Timeout | undefined;

async function fetchModeBCourseIds (base: URL, headers: Record<string, string>): Promise<string[]> {
  const res = await nodeRequest(new URL('courses', base), { headers });
  if (!res.ok) throw new Error('Could not fetch your courses.');
  const courses = await res.json() as Array<{ id: string }>;
  return courses.map((c) => c.id);
}

function sameCourseIds (a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

// A failed refresh (network hiccup, server briefly down) just logs and
// leaves the existing config alone — unlike sign-in, there's no interactive
// form to surface an error on, and dropping the student's swarm connection
// over a transient failure would be worse than staying on stale course IDs
// until the next tick. An empty result is treated the same way: more likely
// a transient/auth blip than "enrolled in zero courses now" — courseIds
// only ever changes here when the new list is non-empty and actually differs.
async function refreshModeBCourses (): Promise<void> {
  if (!currentConfig.modeBToken || !currentConfig.manifestOriginUrl) return;
  let base: URL;
  try {
    const url = currentConfig.manifestOriginUrl;
    base = new URL(url.endsWith('/') ? url : url + '/');
  } catch {
    return;
  }

  let courseIds: string[];
  try {
    courseIds = await fetchModeBCourseIds(base, { Authorization: `Bearer ${currentConfig.modeBToken}` });
  } catch (err) {
    console.error('Mode B course refresh failed:', err instanceof Error ? err.message : String(err));
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { extra: { ipcHandler: 'refreshModeBCourses' } });
    return;
  }
  if (courseIds.length === 0 || sameCourseIds(courseIds, currentConfig.courseIds)) return;

  const merged: PartialDesktopConfig = { ...currentConfig, courseIds };
  saveConfigFile(configFile, merged);
  await restartEngine(merged as DesktopConfig);
}

// Called from configureEngine so the timer always matches whatever config
// is currently active — armed only when a Mode B session exists, disarmed
// (and any previous timer cleared) otherwise, including on sign-out or a
// switch back to Mode A's manual settings.
function startCourseRefreshTimer (config: DesktopConfig): void {
  if (courseRefreshTimer) clearInterval(courseRefreshTimer);
  courseRefreshTimer = config.modeBToken
    ? setInterval(() => {
      refreshModeBCourses().catch((err) => {
        console.error('Mode B course refresh failed:', err);
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { extra: { ipcHandler: 'startCourseRefreshTimer' } });
      });
    }, COURSE_REFRESH_INTERVAL_MS)
    : undefined;
}

function configureEngine (config: DesktopConfig): void {
  currentConfig = config;
  if (config.institutionPublicKeyHex) {
    const headers = authHeaders(config);
    swarmNode = createSwarmNode({
      courseIds: config.courseIds,
      contentDir: paths.contentStoreDir,
      publicKeyHex: config.institutionPublicKeyHex,
      paths,
      originFetcher: config.originUrl ? httpOriginFetcher(config.originUrl, headers) : undefined,
      manifestListFetcher: config.manifestOriginUrl ? httpManifestListFetcher(config.manifestOriginUrl, headers) : undefined,
      manifestSyncIntervalMs: config.manifestOriginUrl ? MANIFEST_SYNC_INTERVAL_MS : undefined,
      maxStoreBytes: config.maxStoreBytes,
      seedingPolicy,
      region: config.region,
    });
    wireAgent(createAgent(swarmNode));
  } else {
    swarmNode = undefined;
    wireAgent(createAgent(unconfiguredEngineEvents(
      'Open Settings and enter the institution public key before syncing can start.'
    )));
  }
  startCourseRefreshTimer(config);
}

// Called whenever Settings saves a new config after the app is already
// running — stops whatever's currently syncing, reconfigures, and starts
// the new engine immediately (unlike the initial boot path, there's no
// app.on('ready') left to wait for).
async function restartEngine (config: DesktopConfig): Promise<void> {
  if (swarmNode) await swarmNode.stop();
  configureEngine(config);
  if (swarmNode) await swarmNode.start();
}

// Built at module load so the tray/window can read agent state immediately
// (mirrors the original eager createSwarmNode() call this replaces) — only
// .start() waits for app.on('ready'), same as before.
configureEngine(mergeConfig(envDefaults, loadConfigFile(configFile)));

function getAppState (): AppState {
  const state = agent.getState();
  return {
    status: state.status,
    peerCount: state.peerCount,
    errorMessage: state.errorMessage,
    seedingAllowed: seedingPolicy.isSeedingAllowed(),
    configured: Boolean(currentConfig?.institutionPublicKeyHex),
  };
}

ipcMain.handle('campvus:get-state', () => getAppState());
ipcMain.handle('campvus:get-config', () => currentConfig);
ipcMain.handle('campvus:save-config', async (_event, config: PartialDesktopConfig): Promise<SaveConfigResult> => {
  const merged: PartialDesktopConfig = { ...currentConfig, ...config };
  const errors = validateConfig(merged);
  if (errors.length > 0) return { ok: false, errors };

  saveConfigFile(configFile, merged);
  await restartEngine(merged as DesktopConfig);
  return { ok: true };
});

// Signs a student in against a live apps/mode-b-api instance and derives
// the rest of the config from it, instead of asking a pilot student to
// hand-copy an institution public key and course IDs. Runs entirely in the
// main process — no CORS to worry about (this isn't a browser fetch) and
// no cookie jar needed, since Mode B's bearer plugin (auth/auth.ts) accepts
// the token this returns as an ordinary Authorization header.
ipcMain.handle('campvus:login-mode-b', async (_event, args: LoginModeBArgs): Promise<LoginModeBResult> => {
  const trimmedUrl = args.modeBUrl.trim();
  if (!trimmedUrl) return { ok: false, error: 'Campvus server URL is required.' };
  let base: URL;
  try {
    base = new URL(trimmedUrl.endsWith('/') ? trimmedUrl : trimmedUrl + '/');
  } catch {
    return { ok: false, error: 'Campvus server URL must be a valid URL.' };
  }

  let signInRes: NodeResponse;
  try {
    signInRes = await nodeRequest(new URL('api/auth/sign-in/email', base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: args.email, password: args.password }),
    });
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      extra: { ipcHandler: 'campvus:login-mode-b', step: 'sign-in-request', modeBUrl: trimmedUrl },
    });
    return { ok: false, error: `Could not reach ${trimmedUrl}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!signInRes.ok) {
    const body = await signInRes.json().catch(() => undefined) as { message?: string } | undefined;
    return { ok: false, error: body?.message || 'Sign-in failed — check your email and password.' };
  }
  const token = signInRes.headers.get('set-auth-token');
  if (!token) return { ok: false, error: 'Server did not return a session token (is it running the bearer auth plugin?).' };
  const headers = { Authorization: `Bearer ${token}` };

  let publicKeyRes: NodeResponse;
  let courseIds: string[];
  try {
    [publicKeyRes, courseIds] = await Promise.all([
      nodeRequest(new URL('public-key', base), { headers }),
      fetchModeBCourseIds(base, headers),
    ]);
  } catch (err) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      extra: { ipcHandler: 'campvus:login-mode-b', step: 'fetch-account-details', modeBUrl: trimmedUrl },
    });
    return { ok: false, error: `Signed in, but could not fetch account details: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!publicKeyRes.ok) return { ok: false, error: 'Signed in, but could not fetch the institution public key.' };

  const { publicKeyHex } = await publicKeyRes.json() as { publicKeyHex: string };
  if (courseIds.length === 0) {
    return { ok: false, error: "Signed in, but you're not enrolled in (or teaching) any courses yet." };
  }

  const merged: PartialDesktopConfig = {
    ...currentConfig,
    modeBToken: token,
    institutionPublicKeyHex: publicKeyHex,
    // httpOriginFetcher (packages/engine/origin.ts) appends the hash
    // directly to originUrl (GET <originUrl>/<hash>) — Mode B's actual
    // route is /content/:hash, not /:hash, so this must include that
    // segment. httpManifestListFetcher, by contrast, already appends
    // 'courses/:courseId/manifests' itself, so manifestOriginUrl is
    // correctly just the bare server URL.
    originUrl: new URL('content/', base).href,
    manifestOriginUrl: trimmedUrl,
    courseIds,
  };
  const errors = validateConfig(merged);
  if (errors.length > 0) return { ok: false, error: errors.map((e) => e.message).join(' ') };

  saveConfigFile(configFile, merged);
  await restartEngine(merged as DesktopConfig);
  return { ok: true, config: merged };
});

// Reads the live swarm node's own knowledge (getKnownManifests) rather
// than loadRegistry(paths) directly — the node's in-memory map is ahead of
// whatever's on disk at any given instant, even though swarm-node.ts now
// persists newly learned manifests back to registry.json as they arrive
// (so a later restart still re-seeds correctly). getKnownManifests is
// already course-scoped and signature-verified internally, so no
// re-filtering is needed here.
function getCourseFiles (): CourseFile[] {
  if (!swarmNode) return [];
  return swarmNode.getKnownManifests().map((m) => ({
    courseId: m.courseId,
    filename: m.filename,
    hash: m.hash,
    size: m.size,
    timestamp: m.timestamp,
    downloaded: hasContent(paths.contentStoreDir, m.hash),
  }));
}

ipcMain.handle('campvus:get-course-files', () => getCourseFiles());

// content-store.ts only ever holds hash-named blobs (dedup by design) — on
// open, copy the bytes out to a stable, human-named path and hand that to
// the OS, rather than ever renaming/mutating anything inside the store
// itself. `filename` comes from a signature-verified manifest (trusted,
// signed by the institution keypair), but path segments are still
// sanitized before touching the filesystem — defense in depth, not a trust
// boundary this code relies on.
function sanitizePathSegment (value: string): string {
  return value.replace(/[\\/]/g, '_').replace(/^\.+/, '_');
}

ipcMain.handle('campvus:open-course-file', async (_event, hash: string): Promise<OpenCourseFileResult> => {
  const file = getCourseFiles().find((f) => f.hash === hash);
  if (!file) return { ok: false, error: 'Unknown file — try refreshing.' };
  if (!file.downloaded) return { ok: false, error: 'Not downloaded yet — still syncing.' };

  const destDir = path.join(paths.rootDir, 'opened-files', sanitizePathSegment(file.courseId));
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, sanitizePathSegment(file.filename));
  fs.copyFileSync(path.join(paths.contentStoreDir, file.hash), destPath);

  const openError = await shell.openPath(destPath);
  return openError ? { ok: false, error: openError } : { ok: true };
});

// Matches @campvus/design's --text-muted / --accent / --danger tokens, so
// the tray dot reads as the same status color as the in-window status dot.
const ICON_COLORS: Record<string, string> = {
  idle: '#616161',
  syncing: '#0f6cbd',
  error: '#c50f1f',
};

// nativeImage.createFromDataURL doesn't decode SVG on Windows (it silently
// returns an empty, 0x0 image — verified via isEmpty()), so the tray icon
// must be rasterized as pixels directly rather than handed an SVG data URL.
const ringIconCache = new Map<string, Electron.NativeImage>();

function trayIcon(status: string): Electron.NativeImage {
  const color = ICON_COLORS[status] ?? ICON_COLORS.idle;
  let icon = ringIconCache.get(color);
  if (!icon) {
    icon = renderRingIcon(color);
    ringIconCache.set(color, icon);
  }
  return icon;
}

// A "C" monogram (open ring, gap on the right) — legible at tray size
// without needing a rasterized asset checked into the repo. Recolored per
// status so the mark itself doubles as the state indicator. Same geometry
// as the original SVG (16x16, center (8,8), radius 6, stroke width 3, gap
// spanning -40deg..40deg), supersampled 4x for anti-aliased edges.
function renderRingIcon (hexColor: string): Electron.NativeImage {
  const size = 16;
  const supersample = 4;
  const hiSize = size * supersample;
  const cx = hiSize / 2;
  const cy = hiSize / 2;
  const radius = 6 * supersample;
  const strokeWidth = 3 * supersample;
  const gapStartDeg = -40;
  const gapEndDeg = 40;
  const { r, g, b } = hexToRgb(hexColor);

  const hi = new Uint8ClampedArray(hiSize * hiSize * 4);
  for (let y = 0; y < hiSize; y++) {
    for (let x = 0; x < hiSize; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const inRing = Math.abs(dist - radius) <= strokeWidth / 2;
      const inGap = angle >= gapStartDeg && angle <= gapEndDeg;
      if (inRing && !inGap) {
        const idx = (y * hiSize + x) * 4;
        hi[idx] = r;
        hi[idx + 1] = g;
        hi[idx + 2] = b;
        hi[idx + 3] = 255;
      }
    }
  }

  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const idx = ((y * supersample + sy) * hiSize + (x * supersample + sx)) * 4;
          const a = hi[idx + 3];
          rSum += hi[idx] * a;
          gSum += hi[idx + 1] * a;
          bSum += hi[idx + 2] * a;
          aSum += a;
        }
      }
      if (aSum > 0) {
        const outIdx = (y * size + x) * 4;
        buffer[outIdx] = rSum / aSum;
        buffer[outIdx + 1] = gSum / aSum;
        buffer[outIdx + 2] = bSum / aSum;
        buffer[outIdx + 3] = Math.round(aSum / (supersample * supersample));
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function hexToRgb (hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

let windowContents: Electron.WebContents | undefined;

const createMainWindow = (): { show(): void } => {
  const mainWindow = new BrowserWindow({
    width: 380,
    height: 520,
    // A resizable tray utility, not a fixed popover — index.css scrolls the
    // active panel under a pinned header, so any size in this range renders
    // correctly. Bounds only keep it from being crushed unreadable or
    // stretched past what a small settings panel should ever need.
    resizable: true,
    minWidth: 340,
    minHeight: 440,
    maxWidth: 640,
    maxHeight: 860,
    show: false,
    autoHideMenuBar: true,
    // packagerConfig.icon (forge.config.ts) only sets the installed .exe's
    // icon — the taskbar/titlebar icon for a running BrowserWindow (in dev
    // and in a packaged build alike) needs to be set here separately.
    // Packaged: forge.config.ts's `extraResource` copies assets/ next to
    // resources/app.asar. Dev: __dirname is .vite/build, one level under
    // the project root assets/ lives in.
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'assets/icon.png')
      : path.join(__dirname, '../assets/icon.png'),
    // Windows 11's own resizable, titled windows (Settings, File Explorer,
    // Notepad) sit on Mica rather than a flat fill — same window shape as
    // this one, so we match it here instead of going frameless. index.css's
    // translucent body background is what actually lets it show through;
    // the opaque backgroundColor + no backgroundMaterial fallback keeps
    // Linux (this app also ships deb/rpm builds) on the old flat white.
    ...(process.platform === 'win32'
      ? { backgroundMaterial: 'mica' as const, backgroundColor: '#00000000' }
      : { backgroundColor: '#ffffff' }), // @campvus/design --bg-primary; avoids a flash before CSS loads
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  windowContents = mainWindow.webContents;

  // Not covered by any default Sentry integration (no Error object exists
  // for either event) — genuinely needs manual wiring, unlike uncaught
  // exceptions/unhandled rejections, which Sentry.init already captures.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    Sentry.captureMessage(`Renderer process gone: ${details.reason}`, {
      level: 'fatal',
      extra: { reason: details.reason, exitCode: details.exitCode },
    });
  });
  mainWindow.webContents.on('unresponsive', () => {
    Sentry.captureMessage('Renderer process became unresponsive', { level: 'warning' });
  });

  // window-controller.ts caches this window and reuses it across tray
  // clicks (ADR-0003) — destroying it on close would leave that cache
  // pointing at a dead BrowserWindow, so hide instead.
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return { show: () => mainWindow.show() };
};

let tray: Tray | undefined;

function refreshTray (): void {
  if (!tray) return;
  const description = agent.getTrayDescription();
  tray.setImage(trayIcon(description.status));
  tray.setToolTip(description.tooltip);
}

// ADR-0003: no BrowserWindow is created at launch — only a tray icon.
// The window is created lazily, on the first tray click, via
// createWindowController (see window-controller.ts).
app.on('ready', () => {
  configureAutoLaunch((settings) => app.setLoginItemSettings(settings));

  tray = new Tray(trayIcon('idle'));
  const windowController = createWindowController(createMainWindow);
  tray.on('click', () => windowController.handleTrayClick());
  refreshTray();

  // Errors are already routed to the tray via agent.onError (see
  // createAgent above) — this catch only stops the rejection from being
  // unhandled.
  swarmNode?.start().catch((err) => {
    console.error('Failed to start swarm engine:', err);
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { extra: { phase: 'swarm-start' } });
  });
});

app.on('window-all-closed', () => {
  // Tray-only app: closing the window must not quit the background agent.
});

app.on('before-quit', () => {
  void swarmNode?.stop();
});
