/**
 * Runs in the "renderer" context. State lives in the main process
 * (ADR-0003) — this window hydrates via `window.campvus.getState()` on
 * load and stays current via `onStateChange`, rather than owning any
 * engine state itself.
 */

import '@campvus/design/index.css';
import './index.css';
import { describeState } from './status-view';
import type { AppState } from './preload-api';

const statusDot = document.getElementById('status-dot') as HTMLElement;
const statusLabel = document.getElementById('status-label') as HTMLElement;
const statusDetail = document.getElementById('status-detail') as HTMLElement;
const peerCount = document.getElementById('peer-count') as HTMLElement;
const seedingValue = document.getElementById('seeding-value') as HTMLElement;
const errorBanner = document.getElementById('error-banner') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLElement;

function render(state: AppState): void {
  const view = describeState(state);

  statusDot.dataset.status = state.status;
  statusLabel.textContent = view.statusLabel;
  statusDetail.textContent = view.statusDetail;
  peerCount.textContent = view.peerCountLabel;
  seedingValue.textContent = view.seedingLabel;

  errorBanner.hidden = view.errorMessage === undefined;
  errorMessage.textContent = view.errorMessage ?? '';
}

window.campvus.getState().then(render);
window.campvus.onStateChange(render);
