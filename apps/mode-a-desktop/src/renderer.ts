/**
 * Runs in the "renderer" context. State lives in the main process
 * (ADR-0003) — this window hydrates via `window.campvus.getState()` on
 * load and stays current via `onStateChange`, rather than owning any
 * engine state itself.
 */

import '@campvus/design/index.css';
import './index.css';
import { describeState } from './status-view';
import { groupCourseFiles } from './course-files-view';
import type { AppState, CourseFile, PartialDesktopConfig } from './preload-api';

const statusDot = document.getElementById('status-dot') as HTMLElement;
const statusLabel = document.getElementById('status-label') as HTMLElement;
const statusDetail = document.getElementById('status-detail') as HTMLElement;
const peerCount = document.getElementById('peer-count') as HTMLElement;
const seedingValue = document.getElementById('seeding-value') as HTMLElement;
const errorBanner = document.getElementById('error-banner') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLElement;

const statusSection = document.getElementById('status-section') as HTMLElement;
const settingsSection = document.getElementById('settings-section') as HTMLElement;
const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
const settingsCancel = document.getElementById('settings-cancel') as HTMLButtonElement;
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const settingsError = document.getElementById('settings-error') as HTMLElement;

const filesSection = document.getElementById('files-section') as HTMLElement;
const filesToggle = document.getElementById('files-toggle') as HTMLButtonElement;
const filesClose = document.getElementById('files-close') as HTMLButtonElement;
const filesList = document.getElementById('files-list') as HTMLElement;
const filesEmpty = document.getElementById('files-empty') as HTMLElement;
const filesError = document.getElementById('files-error') as HTMLElement;

const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const loginError = document.getElementById('login-error') as HTMLElement;
const loginStatus = document.getElementById('login-status') as HTMLElement;

let latestState: AppState | undefined;

function render(state: AppState): void {
  latestState = state;
  const view = describeState(state);

  statusDot.dataset.status = state.status;
  statusLabel.textContent = view.statusLabel;
  statusDetail.textContent = view.statusDetail;
  peerCount.textContent = view.peerCountLabel;
  seedingValue.textContent = view.seedingLabel;

  errorBanner.hidden = view.errorMessage === undefined;
  errorMessage.textContent = view.errorMessage ?? '';
}

type Panel = 'status' | 'settings' | 'files';

// Mutually exclusive — status/settings/files share this one small window
// rather than each getting their own, so opening one always closes the
// others (mirrors the original showSettings(show) boolean, generalized to
// a third panel).
let currentPanel: Panel = 'status';

function setPanel (panel: Panel): void {
  currentPanel = panel;
  statusSection.hidden = panel !== 'status';
  settingsSection.hidden = panel !== 'settings';
  filesSection.hidden = panel !== 'files';
}

function populateForm (config: PartialDesktopConfig): void {
  (settingsForm.elements.namedItem('courseIds') as HTMLInputElement).value = (config.courseIds ?? []).join(', ');
  (settingsForm.elements.namedItem('institutionPublicKeyHex') as HTMLInputElement).value = config.institutionPublicKeyHex ?? '';
  (settingsForm.elements.namedItem('originUrl') as HTMLInputElement).value = config.originUrl ?? '';
  (settingsForm.elements.namedItem('manifestOriginUrl') as HTMLInputElement).value = config.manifestOriginUrl ?? '';
  (settingsForm.elements.namedItem('region') as HTMLInputElement).value = config.region ?? '';
  (settingsForm.elements.namedItem('maxStoreBytes') as HTMLInputElement).value = config.maxStoreBytes?.toString() ?? '';
}

function readForm (): PartialDesktopConfig {
  const data = new FormData(settingsForm);
  const maxStoreBytesRaw = (data.get('maxStoreBytes') as string).trim();
  const courseIds = (data.get('courseIds') as string).split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  return {
    courseIds,
    institutionPublicKeyHex: (data.get('institutionPublicKeyHex') as string).trim(),
    originUrl: (data.get('originUrl') as string).trim() || undefined,
    manifestOriginUrl: (data.get('manifestOriginUrl') as string).trim() || undefined,
    region: (data.get('region') as string).trim() || undefined,
    maxStoreBytes: maxStoreBytesRaw ? Number(maxStoreBytesRaw) : undefined,
  };
}

settingsToggle.addEventListener('click', async () => {
  settingsError.hidden = true;
  populateForm(await window.campvus.getConfig());
  setPanel('settings');
});

settingsCancel.addEventListener('click', () => {
  // Unconfigured installs have nothing to cancel back to — keep the form
  // open rather than swapping to an empty status card.
  if (latestState && !latestState.configured) return;
  setPanel('status');
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  settingsError.hidden = true;

  const result = await window.campvus.saveConfig(readForm());
  if (!result.ok) {
    settingsError.textContent = result.errors?.map((e) => e.message).join(' ') ?? 'Could not save settings.';
    settingsError.hidden = false;
    return;
  }

  setPanel('status');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginStatus.hidden = false;
  loginStatus.textContent = 'Signing in…';
  loginSubmit.disabled = true;

  const data = new FormData(loginForm);
  try {
    const result = await window.campvus.loginModeB({
      modeBUrl: (data.get('modeBUrl') as string).trim(),
      email: (data.get('email') as string).trim(),
      password: data.get('password') as string,
    });

    if (!result.ok) {
      loginStatus.hidden = true;
      loginError.textContent = result.error;
      loginError.hidden = false;
      return;
    }

    loginStatus.textContent = 'Signed in.';
    populateForm(result.config);
    setPanel('status');
  } finally {
    loginSubmit.disabled = false;
  }
});

function renderFiles (files: CourseFile[]): void {
  const groups = groupCourseFiles(files);
  filesList.replaceChildren();
  filesEmpty.hidden = groups.length > 0;

  for (const group of groups) {
    const heading = document.createElement('div');
    heading.className = 'eyebrow';
    heading.textContent = group.courseId;
    filesList.appendChild(heading);

    for (const file of group.files) {
      const row = document.createElement('div');
      row.className = 'detail-row';

      const label = document.createElement('span');
      label.className = 'muted';
      label.textContent = `${file.filename} · ${file.sizeLabel}`;
      row.appendChild(label);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'btn btn-secondary';
      action.textContent = file.canOpen ? 'Open' : file.statusLabel;
      action.disabled = !file.canOpen;
      action.addEventListener('click', async () => {
        filesError.hidden = true;
        action.disabled = true;
        const result = await window.campvus.openCourseFile(file.hash);
        action.disabled = !file.canOpen;
        if (!result.ok) {
          filesError.textContent = result.error ?? 'Could not open this file.';
          filesError.hidden = false;
        }
      });
      row.appendChild(action);

      filesList.appendChild(row);
    }
  }
}

async function refreshFiles (): Promise<void> {
  renderFiles(await window.campvus.getCourseFiles());
}

filesToggle.addEventListener('click', async () => {
  filesError.hidden = true;
  setPanel('files');
  await refreshFiles();
});

filesClose.addEventListener('click', () => {
  setPanel('status');
});

window.campvus.getState().then((state) => {
  render(state);
  if (!state.configured) {
    window.campvus.getConfig().then((config) => {
      populateForm(config);
      setPanel('settings');
    });
  }
});
window.campvus.onStateChange((state) => {
  render(state);
  // Refresh the open files panel as syncing progresses (a file's status
  // flips from "Syncing…" to "Open"), rather than requiring the panel to
  // be closed and reopened to see it.
  if (currentPanel === 'files') void refreshFiles();
});
