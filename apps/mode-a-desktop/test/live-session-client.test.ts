import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMultipartUpload } from '../src/live-session-client'

test('buildMultipartUpload wraps the recording bytes in a single-file multipart body', () => {
  const content = Buffer.from('recording bytes')
  const { body, contentType } = buildMultipartUpload('live-demo.webm', content)

  assert.match(contentType, /^multipart\/form-data; boundary=/)
  const boundary = contentType.split('boundary=')[1]
  assert.ok(body.toString('latin1').includes(`--${boundary}`))
  assert.ok(body.toString('latin1').includes('filename="live-demo.webm"'))
  assert.ok(body.includes(content))
})

test('buildMultipartUpload accepts a custom boundary', () => {
  const { body, contentType } = buildMultipartUpload('a.webm', Buffer.from('x'), 'custom-boundary')
  assert.equal(contentType, 'multipart/form-data; boundary=custom-boundary')
  assert.ok(body.toString('latin1').startsWith('--custom-boundary\r\n'))
})
