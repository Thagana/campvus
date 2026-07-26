import test from 'node:test'
import assert from 'node:assert/strict'
import { configureAutoLaunch } from '../src/auto-launch'

test('configures the app to open at login, starting hidden', () => {
  let received: unknown
  configureAutoLaunch((settings) => { received = settings })

  assert.deepEqual(received, { openAtLogin: true, openAsHidden: true })
})
