import { app, BrowserWindow, Tray, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { networkAwareSeedingPolicy, alwaysAllowSeeding } from '@campvus/engine';
import { createAgent, AgentEngineEvents } from './agent';
import { createWindowController } from './window-controller';
import { selectDesktopSeedingPolicy } from './seeding-policy-selection';
import { configureAutoLaunch } from './auto-launch';

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
void seedingPolicy; // wired for construction; consumed once the engine connection below is real

// TODO(#engine-events): packages/engine's swarm-node.ts is CLI-shaped
// (parses argv, runs to completion, logs to console) — it doesn't yet
// expose the live start/stop + event-emitting interface AgentEngineEvents
// expects. Until that refactor lands, the agent has nothing real to
// subscribe to, so its status stays 'idle'. Tracked as follow-up work; not
// faked here.
const stubEngineEvents: AgentEngineEvents = {
  onSyncStart: () => {},
  onSyncEnd: () => {},
  onError: () => {},
  onPeerCountChange: () => {},
};

const agent = createAgent(stubEngineEvents);

const ICON_COLORS: Record<string, string> = {
  idle: '#6b7280',
  syncing: '#2563eb',
  error: '#dc2626',
};

function trayIcon(status: string): Electron.NativeImage {
  // Placeholder solid-color 16x16 icons — real icon art is a follow-up
  // design task, not an engineering one; the status→color mapping is what
  // this pass wires up.
  const color = ICON_COLORS[status] ?? ICON_COLORS.idle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${color}"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

const createMainWindow = (): { show(): void } => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
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
});

app.on('window-all-closed', () => {
  // Tray-only app: closing the window must not quit the background agent.
});
