import { AgentEngineEvents } from '../src/agent'

// Test double for AgentEngineEvents: records the handlers `createAgent`
// registers, and exposes `emit*` methods so tests can drive them directly
// instead of needing a real engine.
export class FakeEngineEvents implements AgentEngineEvents {
  private syncStartHandlers: Array<() => void> = []
  private syncEndHandlers: Array<() => void> = []
  private errorHandlers: Array<(err: Error) => void> = []
  private peerCountHandlers: Array<(count: number) => void> = []

  onSyncStart (handler: () => void): void { this.syncStartHandlers.push(handler) }
  onSyncEnd (handler: () => void): void { this.syncEndHandlers.push(handler) }
  onError (handler: (err: Error) => void): void { this.errorHandlers.push(handler) }
  onPeerCountChange (handler: (count: number) => void): void { this.peerCountHandlers.push(handler) }

  emitSyncStart (): void { for (const h of this.syncStartHandlers) h() }
  emitSyncEnd (): void { for (const h of this.syncEndHandlers) h() }
  emitError (err: Error): void { for (const h of this.errorHandlers) h(err) }
  emitPeerCountChange (count: number): void { for (const h of this.peerCountHandlers) h(count) }
}
