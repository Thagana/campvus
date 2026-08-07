/**
 * Runs in the "renderer" context. State lives in the main process
 * (ADR-0003) — this window hydrates via `window.campvus.getState()` on
 * load and stays current via `onStateChange`, rather than owning any
 * engine state itself.
 */

import '@campvus/design/index.css';
import './index.css';
import { describeState } from './status-view';
import type { AppState, PartialDesktopConfig } from './preload-api';

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

function showSettings (show: boolean): void {
  settingsSection.hidden = !show;
  statusSection.hidden = show;
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
  showSettings(true);
});

settingsCancel.addEventListener('click', () => {
  // Unconfigured installs have nothing to cancel back to — keep the form
  // open rather than swapping to an empty status card.
  if (latestState && !latestState.configured) return;
  showSettings(false);
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

  showSettings(false);
});

window.campvus.getState().then((state) => {
  render(state);
  if (!state.configured) {
    window.campvus.getConfig().then((config) => {
      populateForm(config);
      showSettings(true);
    });
  }
});
window.campvus.onStateChange(render);
