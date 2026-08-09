import test from 'node:test'
import assert from 'node:assert/strict'
import { toFormValues, toConfig, EMPTY_SETTINGS } from '../src/settings-form'
import type { PartialDesktopConfig } from '../src/preload-api'

test('toFormValues renders an empty config as blank fields', () => {
  const values = toFormValues({})

  assert.deepEqual(values, EMPTY_SETTINGS)
})

test('toFormValues joins courseIds with ", " and stringifies maxStoreBytes', () => {
  const config: PartialDesktopConfig = {
    courseIds: ['COMSCI214', 'MATH101'],
    institutionPublicKeyHex: 'abc123',
    originUrl: 'https://lms.example.edu',
    manifestOriginUrl: 'https://lms.example.edu/manifests',
    region: 'campus-west',
    maxStoreBytes: 5_000_000_000
  }

  const values = toFormValues(config)

  assert.equal(values.courseIds, 'COMSCI214, MATH101')
  assert.equal(values.institutionPublicKeyHex, 'abc123')
  assert.equal(values.originUrl, 'https://lms.example.edu')
  assert.equal(values.manifestOriginUrl, 'https://lms.example.edu/manifests')
  assert.equal(values.region, 'campus-west')
  assert.equal(values.maxStoreBytes, '5000000000')
})

test('toConfig splits and trims comma-separated course IDs, dropping empties', () => {
  const config = toConfig({ ...EMPTY_SETTINGS, courseIds: ' COMSCI214,  MATH101 ,,' })

  assert.deepEqual(config.courseIds, ['COMSCI214', 'MATH101'])
})

test('toConfig treats blank optional fields as undefined, not empty strings', () => {
  const config = toConfig({ ...EMPTY_SETTINGS, originUrl: '   ', manifestOriginUrl: '', region: '' })

  assert.equal(config.originUrl, undefined)
  assert.equal(config.manifestOriginUrl, undefined)
  assert.equal(config.region, undefined)
})

test('toConfig parses maxStoreBytes to a number when present', () => {
  const config = toConfig({ ...EMPTY_SETTINGS, maxStoreBytes: '5000000000' })

  assert.equal(config.maxStoreBytes, 5_000_000_000)
})

test('toConfig leaves maxStoreBytes undefined when blank', () => {
  const config = toConfig({ ...EMPTY_SETTINGS, maxStoreBytes: '  ' })

  assert.equal(config.maxStoreBytes, undefined)
})

test('toConfig trims institutionPublicKeyHex', () => {
  const config = toConfig({ ...EMPTY_SETTINGS, institutionPublicKeyHex: '  abc123  ' })

  assert.equal(config.institutionPublicKeyHex, 'abc123')
})

test('round-trips a full config through toFormValues then toConfig', () => {
  const original: PartialDesktopConfig = {
    courseIds: ['COMSCI214', 'MATH101'],
    institutionPublicKeyHex: 'abc123',
    originUrl: 'https://lms.example.edu',
    manifestOriginUrl: 'https://lms.example.edu/manifests',
    region: 'campus-west',
    maxStoreBytes: 5_000_000_000
  }

  const roundTripped = toConfig(toFormValues(original))

  assert.deepEqual(roundTripped, original)
})
