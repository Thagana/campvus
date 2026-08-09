// Pure helper for main.ts's campvus:finish-live-session handler: a live
// session's recording (packages/engine's swarmNode.takeSessionRecording)
// is raw bytes with no manifest signature — this app has no keypair to
// sign one itself (see ADR-0007's signing-proxy design), so it uploads the
// bytes through apps/mode-b-api's existing multipart manifest route
// (routes/manifests.ts) exactly like a regular file upload, rather than
// adding a second new server endpoint. Kept separate from main.ts (and
// free of any Electron/node:http import) so the multipart body shape is
// unit-testable without a real request.
export function buildMultipartUpload (
  filename: string,
  content: Buffer,
  boundary = 'campvus-live-session-boundary'
): { body: Buffer, contentType: string } {
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n'
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    body: Buffer.concat([head, content, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}
