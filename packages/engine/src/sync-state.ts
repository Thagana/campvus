// Pure tracking of "does this node currently have outstanding work": peer
// count and the set of content hashes known to be missing. Kept separate
// from Hyperswarm so the start/end transition logic is testable without a
// live swarm connection — swarm-node.ts is the I/O shell that drives this
// from real connection/data events.

export interface SyncStateEvents {
  onPeerCountChange (handler: (count: number) => void): void
  onSyncStart (handler: () => void): void
  onSyncEnd (handler: () => void): void
}

export interface SyncStateTracker extends SyncStateEvents {
  peerConnected (): void
  peerDisconnected (): void
  markMissing (hash: string): void
  markObtained (hash: string): void
  peerCount (): number
}

export function createSyncStateTracker (): SyncStateTracker {
  let count = 0
  const missing = new Set<string>()
  const peerCountHandlers: Array<(count: number) => void> = []
  const syncStartHandlers: Array<() => void> = []
  const syncEndHandlers: Array<() => void> = []

  return {
    onPeerCountChange: (handler) => { peerCountHandlers.push(handler) },
    onSyncStart: (handler) => { syncStartHandlers.push(handler) },
    onSyncEnd: (handler) => { syncEndHandlers.push(handler) },
    peerCount: () => count,

    peerConnected () {
      count++
      for (const h of peerCountHandlers) h(count)
    },

    peerDisconnected () {
      count--
      for (const h of peerCountHandlers) h(count)
    },

    // A hash transitioning into "missing" only starts a sync if nothing was
    // already missing — repeated announcements of the same or additional
    // missing hashes while already syncing shouldn't re-fire onSyncStart.
    markMissing (hash) {
      if (missing.has(hash)) return
      const wasEmpty = missing.size === 0
      missing.add(hash)
      if (wasEmpty) for (const h of syncStartHandlers) h()
    },

    markObtained (hash) {
      if (!missing.has(hash)) return
      missing.delete(hash)
      if (missing.size === 0) for (const h of syncEndHandlers) h()
    }
  }
}
