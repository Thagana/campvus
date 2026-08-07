import { app, BrowserWindow, Tray, nativeImage, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { networkAwareSeedingPolicy, alwaysAllowSeeding, createSwarmNode, httpOriginFetcher, SwarmNode } from '@campvus/engine';
import { createAgent, AgentEngineEvents, Agent } from './agent';
import { createWindowController } from './window-controller';
import { selectDesktopSeedingPolicy } from './seeding-policy-selection';
import { configureAutoLaunch } from './auto-launch';
import { getPaths } from './paths';
import type { AppState } from './preload-api';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// ADR-0004: apps/mode-a-desktop seeds freely by default (network-aware
// opt-out for a tethered/metered connection), not the Wi-Fi-only-by-default
// rule the parked mobile client would use.
const seedingPolicy = selectDesktopSeedingPolicy({
  networkAware: networkAwareSeedingPolicy,
  alwaysAllow: alwaysAllowSeeding,
});

// Neither courseId nor the institution's public key have a UI or config
// file yet (ADR/#engine-events follow-up) — for now they're supplied via
// env vars, same information the CLI shim (apps/mode-a-headless) takes as
// argv. Origin fallback is optional, same as the CLI's --origin flag.
const courseId = process.env.CAMPVUS_COURSE_ID ?? 'COMSCI214';
const institutionPublicKeyHex = process.env.CAMPVUS_INSTITUTION_PUBLIC_KEY;
const originUrl = process.env.CAMPVUS_ORIGIN_URL;
const maxStoreBytes = process.env.CAMPVUS_MAX_STORE_BYTES ? Number(process.env.CAMPVUS_MAX_STORE_BYTES) : undefined;
// Tier 2 (local cluster, ADR-0006) — same CAMPVUS_REGION convention as
// peer-node.ts's --region flag. Unset means Tier 2 is simply not joined.
const region = process.env.CAMPVUS_REGION;

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
let swarmNode: SwarmNode | undefined;
let agent: Agent;

if (institutionPublicKeyHex) {
  swarmNode = createSwarmNode({
    courseId,
    contentDir: paths.contentStoreDir,
    publicKeyHex: institutionPublicKeyHex,
    paths,
    originFetcher: originUrl ? httpOriginFetcher(originUrl) : undefined,
    maxStoreBytes,
    seedingPolicy,
    region,
  });
  agent = createAgent(swarmNode);
} else {
  agent = createAgent(unconfiguredEngineEvents(
    'Set CAMPVUS_INSTITUTION_PUBLIC_KEY to the institution public key before syncing can start.'
  ));
}

function getAppState (): AppState {
  const state = agent.getState();
  return {
    status: state.status,
    peerCount: state.peerCount,
    errorMessage: state.errorMessage,
    seedingAllowed: seedingPolicy.isSeedingAllowed(),
  };
}

ipcMain.handle('campvus:get-state', () => getAppState());

// Matches @campvus/design's --text-muted / --accent / --danger tokens, so
// the tray dot reads as the same status color as the in-window status dot.
const ICON_COLORS: Record<string, string> = {
  idle: '#8a847a',
  syncing: '#c96442',
  error: '#a53e2a',
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
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f3ee', // @campvus/design --bg-primary; avoids a white flash before CSS loads
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  windowContents = mainWindow.webContents;

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

agent.onStateChange(() => {
  refreshTray();
  windowContents?.send('campvus:state-changed', getAppState());
});

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
  swarmNode?.start().catch((err) => console.error('Failed to start swarm engine:', err));
});

app.on('window-all-closed', () => {
  // Tray-only app: closing the window must not quit the background agent.
});

app.on('before-quit', () => {
  void swarmNode?.stop();
});
