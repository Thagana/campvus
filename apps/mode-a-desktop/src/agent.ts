export type AgentStatus = 'idle' | 'syncing' | 'error'

export interface TrayDescription {
  status: AgentStatus
  tooltip: string
}

export interface AgentState {
  status: AgentStatus
  peerCount: number
  errorMessage?: string
}

export interface AgentEngineEvents {
  onSyncStart (handler: () => void): void
  onSyncEnd (handler: () => void): void
  onError (handler: (err: Error) => void): void
  onPeerCountChange (handler: (count: number) => void): void
}

export interface Agent {
  getTrayDescription (): TrayDescription
  getState (): AgentState
  // The main process is the source of truth for engine state (ADR-0003) —
  // a renderer window may not exist yet when state changes, so it hydrates
  // via getState() on open and this notifies it (and the tray) of updates
  // while it's around.
  onStateChange (handler: (state: AgentState) => void): void
}

export function createAgent (engine: AgentEngineEvents): Agent {
  let status: AgentStatus = 'idle'
  let peerCount = 0
  let lastError: Error | undefined
  const listeners: Array<(state: AgentState) => void> = []

  const getState = (): AgentState => ({
    status,
    peerCount,
    errorMessage: lastError?.message
  })

  const notify = (): void => {
    const state = getState()
    for (const listener of listeners) listener(state)
  }

  engine.onSyncStart(() => { status = 'syncing'; notify() })
  engine.onSyncEnd(() => { status = 'idle'; notify() })
  engine.onError((err) => { status = 'error'; lastError = err; notify() })
  engine.onPeerCountChange((count) => { peerCount = count; notify() })

  return {
    getState,
    onStateChange: (handler) => { listeners.push(handler) },
    getTrayDescription: () => ({
      status,
      tooltip: status === 'error'
        ? `Error: ${lastError?.message}`
        : `${peerCount} peer${peerCount === 1 ? '' : 's'} connected`
    })
  }
}
