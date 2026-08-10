// hyperswarm ships no type declarations and has no @types package on npm.
// This covers only the subset of its API this project actually uses
// (see engine/swarm-node.ts) — not a full surface declaration.
declare module 'hyperswarm' {
  import { Duplex } from 'stream'

  interface PeerInfo {
    publicKey: Buffer
    client: boolean
    // Which joined-topic buffers this peer was found under (see
    // lib/peer-info.js in the installed package — present at runtime, just
    // absent from this hand-maintained shim before now).
    topics: Buffer[]
  }

  interface Discovery {
    flushed(): Promise<void>
  }

  interface JoinOptions {
    server?: boolean
    client?: boolean
  }

  class Hyperswarm {
    constructor(opts?: Record<string, unknown>)
    on(event: 'connection', listener: (conn: Duplex, info: PeerInfo) => void): this
    on(event: string, listener: (...args: unknown[]) => void): this
    join(topic: Buffer, opts?: JoinOptions): Discovery
    destroy(): Promise<void>
  }

  export = Hyperswarm
}
