import type { PartialDesktopConfig } from './preload-api'

// Pure conversion between PartialDesktopConfig and the settings form's
// string-only field values — kept separate from SettingsPanel.tsx's DOM
// wiring, same split as status-view.ts/course-files-view.ts.

export interface SettingsFormValues {
  courseIds: string
  institutionPublicKeyHex: string
  originUrl: string
  manifestOriginUrl: string
  region: string
  maxStoreBytes: string
}

export const EMPTY_SETTINGS: SettingsFormValues = {
  courseIds: '',
  institutionPublicKeyHex: '',
  originUrl: '',
  manifestOriginUrl: '',
  region: '',
  maxStoreBytes: ''
}

export function toFormValues (config: PartialDesktopConfig): SettingsFormValues {
  return {
    courseIds: (config.courseIds ?? []).join(', '),
    institutionPublicKeyHex: config.institutionPublicKeyHex ?? '',
    originUrl: config.originUrl ?? '',
    manifestOriginUrl: config.manifestOriginUrl ?? '',
    region: config.region ?? '',
    maxStoreBytes: config.maxStoreBytes?.toString() ?? ''
  }
}

export function toConfig (values: SettingsFormValues): PartialDesktopConfig {
  return {
    courseIds: values.courseIds.split(',').map((id) => id.trim()).filter((id) => id.length > 0),
    institutionPublicKeyHex: values.institutionPublicKeyHex.trim(),
    originUrl: values.originUrl.trim() || undefined,
    manifestOriginUrl: values.manifestOriginUrl.trim() || undefined,
    region: values.region.trim() || undefined,
    maxStoreBytes: values.maxStoreBytes.trim() ? Number(values.maxStoreBytes.trim()) : undefined
  }
}
