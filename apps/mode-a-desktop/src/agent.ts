export type AgentStatus = 'idle' | 'syncing' | 'error'

export interface TrayDescription {
  status: AgentStatus
  tooltip: string
}

export interface AgentEngineEvents {
  onSyncStart (handler: () => void): void
  onSyncEnd (handler: () => void): void
  onError (handler: (err: Error) => void): void
  onPeerCountChange (handler: (count: number) => void): void
}

export interface Agent {
  getTrayDescription (): TrayDescription
}

export function createAgent (engine: AgentEngineEvents): Agent {
  let status: AgentStatus = 'idle'
  let peerCount = 0
  let lastError: Error | undefined

  engine.onSyncStart(() => { status = 'syncing' })
  engine.onSyncEnd(() => { status = 'idle' })
  engine.onError((err) => { status = 'error'; lastError = err })
  engine.onPeerCountChange((count) => { peerCount = count })

  return {
    getTrayDescription: () => ({
      status,
      tooltip: status === 'error'
        ? `Error: ${lastError?.message}`
        : `${peerCount} peer${peerCount === 1 ? '' : 's'} connected`
    })
  }
}
