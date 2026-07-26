import test from 'node:test'
import assert from 'node:assert/strict'
import { createWindowController } from '../src/window-controller'

test('does not create a window before the tray is clicked', () => {
  let createCount = 0
  createWindowController(() => { createCount++; return { show: () => {} } })

  assert.equal(createCount, 0)
})

test('creates a window on the first tray click', () => {
  let createCount = 0
  const controller = createWindowController(() => { createCount++; return { show: () => {} } })

  controller.handleTrayClick()

  assert.equal(createCount, 1)
})

test('reuses the existing window on subsequent tray clicks instead of recreating it', () => {
  let createCount = 0
  const controller = createWindowController(() => { createCount++; return { show: () => {} } })

  controller.handleTrayClick()
  controller.handleTrayClick()
  controller.handleTrayClick()

  assert.equal(createCount, 1)
})

test('shows the window on every tray click, including reused-window clicks', () => {
  let showCount = 0
  const controller = createWindowController(() => ({ show: () => { showCount++ } }))

  controller.handleTrayClick()
  controller.handleTrayClick()

  assert.equal(showCount, 2)
})
