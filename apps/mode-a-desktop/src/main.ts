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

function trayIcon(status: string): Electron.NativeImage {
  // A "C" monogram (open ring, gap on the right) rendered as a 16x16 arc —
  // legible at tray size without needing a rasterized asset. Recolored per
  // status so the mark itself doubles as the state indicator.
  const color = ICON_COLORS[status] ?? ICON_COLORS.idle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M12.6 4.14 A6 6 0 1 0 12.6 11.86" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
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
