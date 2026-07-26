// Mode A ingestion adapter: the LMS-adjacent "watcher".
//
// Real version: subscribes to LMS webhooks / polls the LMS API. This spike
// simulates "a lecturer uploaded a file" as a manual CLI call, so the rest
// of the pipeline (hash, sign, publish, distribute) can be built and tested
// before the LMS integration exists. Everything past argv parsing here is a
// call into the shared engine (@campvus/engine) — a future Mode B
// direct-upload adapter would live in its own app package and call the
// same ingestBuffer/ingestFile functions.
//
// Usage: npx tsx src/watcher.ts <courseId> <path-to-file>

import { ingestFile, SignedManifest } from '@campvus/engine'
import { getPaths } from './paths'

export function run (argv: string[]): SignedManifest {
  const [courseId, filePath] = argv
  if (!courseId || !filePath) {
    console.log('Usage: npx tsx src/watcher.ts <courseId> <path-to-file>')
    process.exit(1)
  }

  const { manifest, deduped } = ingestFile({ courseId, filePath, paths: getPaths() })

  if (deduped) {
    console.log(`Content already registered for course ${courseId} as ${manifest.filename} (hash ${manifest.hash.slice(0, 12)}...) — dedup, no new manifest created.`)
    return manifest
  }

  console.log(`Registered ${manifest.filename} for course ${courseId}`)
  console.log(`  hash: ${manifest.hash}`)
  console.log(`  size: ${manifest.size} bytes`)
  console.log(`  stored at: content-store/${manifest.hash}`)
  console.log(`  signed manifest appended to registry.json`)
  return manifest
}
