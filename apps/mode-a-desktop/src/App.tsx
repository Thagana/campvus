import { useEffect, useState } from 'react'
import { FolderSimple, Gear } from '@phosphor-icons/react'
import { StatusPanel } from './components/StatusPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { CourseFilesPanel } from './components/CourseFilesPanel'
import type { AppState } from './preload-api'

type Panel = 'status' | 'settings' | 'files'

export function App () {
  const [state, setState] = useState<AppState>()
  // Mutually exclusive — status/settings/files share this one small window
  // rather than each getting their own, so opening one always closes the
  // others (mirrors the original renderer.ts's setPanel()).
  const [panel, setPanel] = useState<Panel>('status')

  useEffect(() => {
    window.campvus.getState().then((initialState) => {
      setState(initialState)
      if (!initialState.configured) setPanel('settings')
    })
    return window.campvus.onStateChange(setState)
  }, [])

  if (state === undefined) return null

  return (
    <main className="app">
      <header className="app-header">
        <span className="eyebrow">Campvus</span>
        <span className="header-actions">
          <span className="status-dot" data-status={state.status} />
          <button type="button" className="btn-ghost" aria-current={panel === 'files'} onClick={() => setPanel('files')}>
            <FolderSimple aria-hidden /> Files
          </button>
          <button type="button" className="btn-ghost settings-toggle" aria-current={panel === 'settings'} onClick={() => setPanel('settings')}>
            <Gear aria-hidden /> Settings
          </button>
        </span>
      </header>

      <div className="panel-body">
        {panel === 'status' && <StatusPanel state={state} />}
        {panel === 'files' && <CourseFilesPanel refreshSignal={state} onClose={() => setPanel('status')} />}
        {panel === 'settings' && (
          <SettingsPanel
            configured={state.configured}
            onSaved={() => setPanel('status')}
            onCancel={() => setPanel('status')}
          />
        )}
      </div>
    </main>
  )
}
