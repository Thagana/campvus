// Tier 1 discovery (ADR-0006): same-LAN peers found via mDNS, connected to
// directly over plain TCP — bypassing the Hyperswarm/HyperDHT join in
// swarm-node.ts entirely for this path. Safe to trust the same way as any
// other peer: the wire protocol's manifest signatures and content-hash
// checks (§6) are what establish integrity, not the transport, so an
// unauthenticated LAN TCP socket carries the same guarantees as an
// authenticated Hyperswarm connection — it just can't be trusted to keep
// the bytes-in-flight confidential from others on the LAN, which doesn't
// matter for course material that isn't secret.

import crypto from 'crypto'
import net, { Socket } from 'net'
import Bonjour from 'bonjour-service'

const SERVICE_TYPE = 'campvus'

export interface LanPeerTxt {
  topic: string
  id: string
}

// bonjour-service (a CommonJS `export =` module) doesn't cleanly expose its
// Service class as an importable type — this is the minimal shape this
// module actually reads off the objects `find()`'s callback hands back.
interface DiscoveredService {
  addresses?: string[]
  port: number
  txt?: Partial<LanPeerTxt>
}

// Pure filter: is this advertisement relevant to us at all? Excludes our
// own advertisement (bonjour-service can see it depending on platform/
// network config) and anyone advertising a different course's topic.
export function isRelevantLanPeer (txt: Partial<LanPeerTxt> | undefined, ourTopicHex: string, ourId: string): txt is LanPeerTxt {
  return !!txt && txt.topic === ourTopicHex && txt.id !== ourId
}

// Pure tie-breaker: mDNS discovery is symmetric (both sides see each
// other), so exactly one side must initiate the TCP connection or every
// pair of peers ends up double-connected. Lexicographically-lower id
// initiates; the other side just listens and accepts.
export function shouldInitiateLanConnection (ourId: string, theirId: string): boolean {
  return ourId < theirId
}

export interface LanDiscoveryOptions {
  topic: Buffer
  onConnection: (socket: Socket) => void
  onError?: (err: Error) => void
}

export interface LanDiscovery {
  start (): Promise<void>
  stop (): Promise<void>
}

export function createLanDiscovery (options: LanDiscoveryOptions): LanDiscovery {
  const { topic, onConnection, onError = () => {} } = options
  const ourTopicHex = topic.toString('hex')
  const ourId = crypto.randomUUID()

  // net.Server#close()'s callback only fires once every connection it
  // handed out has ended (Node's documented behaviour), and swarm-node.ts
  // hands connections off to its own long-lived message handler rather
  // than closing them itself — so stop() must track and force-destroy
  // every socket this module opened/accepted, or it hangs forever waiting
  // for connections nobody here owns the lifecycle of.
  const sockets = new Set<Socket>()

  function track (socket: Socket): void {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  }

  const server = net.createServer((socket) => {
    track(socket)
    onConnection(socket)
  })
  const bonjour = new Bonjour()
  const connectedAddresses = new Set<string>()

  function tryConnect (service: DiscoveredService): void {
    if (!isRelevantLanPeer(service.txt, ourTopicHex, ourId)) return
    if (!shouldInitiateLanConnection(ourId, service.txt.id)) return

    const address = service.addresses?.[0]
    if (!address) return
    const key = `${address}:${service.port}`
    if (connectedAddresses.has(key)) return
    connectedAddresses.add(key)

    const socket = net.connect({ host: address, port: service.port })
    track(socket)
    socket.on('error', (err: Error) => {
      connectedAddresses.delete(key)
      onError(err)
    })
    socket.on('close', () => connectedAddresses.delete(key))
    onConnection(socket)
  }

  return {
    async start (): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.on('error', reject)
        server.listen(0, () => resolve())
      })
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0

      bonjour.publish({ name: `campvus-${ourId}`, type: SERVICE_TYPE, port, txt: { topic: ourTopicHex, id: ourId } })
      bonjour.find({ type: SERVICE_TYPE }, tryConnect)
    },

    async stop (): Promise<void> {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => bonjour.destroy(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}
