// Real config surface for gap #12 (docs/TODO.md) — until now courseId,
// institutionPublicKeyHex, originUrl, region and maxStoreBytes only came
// from env vars (main.ts), so a misconfigured install got stuck on a
// misleading tray error with no way to fix it short of relaunching with
// different env vars. This persists the same fields to a JSON file in the
// app's userData dir so they're settable from the window UI instead.

import fs from 'node:fs'
import path from 'node:path'

export interface DesktopConfig {
  // A student is normally enrolled in several courses at once — see
  // @campvus/engine's SwarmNodeOptions.courseIds.
  courseIds: string[]
  institutionPublicKeyHex?: string
  originUrl?: string
  // §9 manifest-sync bridge (gap #3, docs/TODO.md) — separate base URL
  // from originUrl since a real origin (e.g. apps/mode-b-api) serves the
  // manifest list and file bytes from different routes.
  manifestOriginUrl?: string
  region?: string
  maxStoreBytes?: number
}

export type PartialDesktopConfig = Partial<DesktopConfig>

const PUBLIC_KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i

export interface ConfigValidationError {
  field: keyof DesktopConfig
  message: string
}

// Pure — no filesystem access — so callers (IPC handlers, tests) can
// validate a form submission before touching disk or restarting the engine.
export function validateConfig (config: PartialDesktopConfig): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []

  if (!config.courseIds || config.courseIds.filter((id) => id.trim() !== '').length === 0) {
    errors.push({ field: 'courseIds', message: 'At least one course ID is required.' })
  }

  if (!config.institutionPublicKeyHex || config.institutionPublicKeyHex.trim() === '') {
    errors.push({ field: 'institutionPublicKeyHex', message: 'Institution public key is required.' })
  } else if (!PUBLIC_KEY_HEX_PATTERN.test(config.institutionPublicKeyHex.trim())) {
    errors.push({ field: 'institutionPublicKeyHex', message: 'Institution public key must be 64 hex characters.' })
  }

  if (config.originUrl) {
    try {
      new URL(config.originUrl)
    } catch {
      errors.push({ field: 'originUrl', message: 'Origin URL must be a valid URL.' })
    }
  }

  if (config.manifestOriginUrl) {
    try {
      new URL(config.manifestOriginUrl)
    } catch {
      errors.push({ field: 'manifestOriginUrl', message: 'Manifest origin URL must be a valid URL.' })
    }
  }

  if (config.maxStoreBytes !== undefined && (!Number.isFinite(config.maxStoreBytes) || config.maxStoreBytes <= 0)) {
    errors.push({ field: 'maxStoreBytes', message: 'Max store size must be a positive number.' })
  }

  return errors
}

// Env vars remain a valid way to seed first-run config (e.g. scripted
// pilot rollouts) — file config, once saved, takes precedence field-by-field
// over whatever env vars are still set.
export function mergeConfig (envDefaults: PartialDesktopConfig, fileConfig: PartialDesktopConfig): DesktopConfig {
  return {
    courseIds: fileConfig.courseIds ?? envDefaults.courseIds ?? ['COMSCI214'],
    institutionPublicKeyHex: fileConfig.institutionPublicKeyHex ?? envDefaults.institutionPublicKeyHex,
    originUrl: fileConfig.originUrl ?? envDefaults.originUrl,
    manifestOriginUrl: fileConfig.manifestOriginUrl ?? envDefaults.manifestOriginUrl,
    region: fileConfig.region ?? envDefaults.region,
    maxStoreBytes: fileConfig.maxStoreBytes ?? envDefaults.maxStoreBytes
  }
}

export function loadConfigFile (filePath: string): PartialDesktopConfig {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    // Missing file (first run) or corrupt JSON — either way, fall back to
    // env defaults rather than crashing the main process on boot.
    return {}
  }
}

export function saveConfigFile (filePath: string, config: PartialDesktopConfig): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
}
