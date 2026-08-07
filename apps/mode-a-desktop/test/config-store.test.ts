import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateConfig, mergeConfig, loadConfigFile, saveConfigFile } from '../src/config-store'

const VALID_KEY = 'a'.repeat(64)

test('validateConfig requires at least one course ID and a well-formed institution public key', () => {
  const errors = validateConfig({})

  assert.ok(errors.some((e) => e.field === 'courseIds'))
  assert.ok(errors.some((e) => e.field === 'institutionPublicKeyHex'))
})

test('validateConfig rejects an empty courseIds array the same as a missing one', () => {
  const errors = validateConfig({ courseIds: [], institutionPublicKeyHex: VALID_KEY })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].field, 'courseIds')
})

test('validateConfig rejects a public key that is not 64 hex chars', () => {
  const errors = validateConfig({ courseIds: ['COMSCI214'], institutionPublicKeyHex: 'not-hex' })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].field, 'institutionPublicKeyHex')
})

test('validateConfig accepts a well-formed config with several courses and optional fields', () => {
  const errors = validateConfig({
    courseIds: ['COMSCI214', 'MATH101'],
    institutionPublicKeyHex: VALID_KEY,
    originUrl: 'https://lms.example.edu',
    region: 'campus-west',
    maxStoreBytes: 5_000_000_000
  })

  assert.deepEqual(errors, [])
})

test('validateConfig rejects a malformed origin URL', () => {
  const errors = validateConfig({ courseIds: ['COMSCI214'], institutionPublicKeyHex: VALID_KEY, originUrl: 'not a url' })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].field, 'originUrl')
})

test('validateConfig rejects a malformed manifest origin URL', () => {
  const errors = validateConfig({ courseIds: ['COMSCI214'], institutionPublicKeyHex: VALID_KEY, manifestOriginUrl: 'not a url' })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].field, 'manifestOriginUrl')
})

test('validateConfig rejects a non-positive maxStoreBytes', () => {
  const errors = validateConfig({ courseIds: ['COMSCI214'], institutionPublicKeyHex: VALID_KEY, maxStoreBytes: 0 })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].field, 'maxStoreBytes')
})

test('mergeConfig prefers file config over env defaults field-by-field', () => {
  const merged = mergeConfig(
    { courseIds: ['ENV-COURSE'], institutionPublicKeyHex: 'env-key', region: 'env-region' },
    { institutionPublicKeyHex: 'file-key' }
  )

  assert.deepEqual(merged.courseIds, ['ENV-COURSE'])
  assert.equal(merged.institutionPublicKeyHex, 'file-key')
  assert.equal(merged.region, 'env-region')
})

test('mergeConfig prefers the file courseIds list over env defaults entirely, not merged', () => {
  const merged = mergeConfig(
    { courseIds: ['ENV-COURSE'] },
    { courseIds: ['COMSCI214', 'MATH101'] }
  )

  assert.deepEqual(merged.courseIds, ['COMSCI214', 'MATH101'])
})

test('mergeConfig falls back to the COMSCI214 default courseIds when neither source sets one', () => {
  const merged = mergeConfig({}, {})

  assert.deepEqual(merged.courseIds, ['COMSCI214'])
})

test('loadConfigFile returns an empty object when the file does not exist', () => {
  const missingPath = path.join(os.tmpdir(), `campvus-config-missing-${Date.now()}.json`)

  assert.deepEqual(loadConfigFile(missingPath), {})
})

test('saveConfigFile then loadConfigFile round-trips the config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campvus-config-'))
  const filePath = path.join(dir, 'nested', 'desktop-config.json')

  const config = { courseIds: ['COMSCI214', 'MATH101'], institutionPublicKeyHex: VALID_KEY }
  saveConfigFile(filePath, config)

  assert.deepEqual(loadConfigFile(filePath), config)

  fs.rmSync(dir, { recursive: true, force: true })
})
