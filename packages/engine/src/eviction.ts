// Storage eviction (§7): devices can't seed everything forever. LRU by
// last-access, capped at a configured total size — the simplest policy the
// architecture doc recommends, with a sane opt-in default (no cap unless
// configured, matching today's existing behaviour when the flag isn't set).

import { ContentStat, deleteContent, listContentStats } from './content-store'

// Pure: given current content stats and a byte budget, decide what to
// evict — oldest last-accessed first — until the total is within budget.
// Returns hashes to remove, does no I/O itself.
export function pickEvictions (files: ContentStat[], maxTotalBytes: number): string[] {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  if (totalBytes <= maxTotalBytes) return []

  const oldestFirst = [...files].sort((a, b) => a.lastAccessMs - b.lastAccessMs)

  const toEvict: string[] = []
  let remaining = totalBytes
  for (const file of oldestFirst) {
    if (remaining <= maxTotalBytes) break
    toEvict.push(file.hash)
    remaining -= file.size
  }
  return toEvict
}

export function enforceStorageCap (contentDir: string, maxTotalBytes: number): string[] {
  const files = listContentStats(contentDir)
  const evicted = pickEvictions(files, maxTotalBytes)
  for (const hash of evicted) {
    deleteContent(contentDir, hash)
  }
  return evicted
}
