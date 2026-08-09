import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import { Eye, EyeSlash, WarningCircle, Check } from '@phosphor-icons/react'
import { toFormValues, toConfig, EMPTY_SETTINGS, type SettingsFormValues } from '../settings-form'

export function SettingsPanel ({ configured, onSaved, onCancel }: {
  configured: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS)
  const [settingsError, setSettingsError] = useState<string>()

  const [modeBUrl, setModeBUrl] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState<string>()
  const [loginStatus, setLoginStatus] = useState<string>()

  useEffect(() => {
    window.campvus.getConfig().then((config) => setSettings(toFormValues(config)))
  }, [])

  function updateField (field: keyof SettingsFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setSettings((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  async function handleLoginSubmit (event: FormEvent): Promise<void> {
    event.preventDefault()
    setLoginError(undefined)
    setLoginStatus('Signing in…')
    setSigningIn(true)

    try {
      const result = await window.campvus.loginModeB({ modeBUrl: modeBUrl.trim(), email: email.trim(), password })

      if (!result.ok) {
        setLoginStatus(undefined)
        setLoginError(result.error)
        return
      }

      setLoginStatus('Signed in.')
      setSettings(toFormValues(result.config))
      onSaved()
    } finally {
      setSigningIn(false)
    }
  }

  async function handleSettingsSubmit (event: FormEvent): Promise<void> {
    event.preventDefault()
    setSettingsError(undefined)

    const result = await window.campvus.saveConfig(toConfig(settings))
    if (!result.ok) {
      setSettingsError(result.errors?.map((e) => e.message).join(' ') ?? 'Could not save settings.')
      return
    }

    onSaved()
  }

  function handleCancel (): void {
    // Unconfigured installs have nothing to cancel back to — keep the form
    // open rather than swapping to an empty status card.
    if (!configured) return
    onCancel()
  }

  return (
    <section className="card settings-card">
      <h2>Sign in to Campvus</h2>
      <p className="muted">Signs in against your school&apos;s Campvus server and fills in the fields below automatically — the manual fields further down are only for a plain LMS origin, not a Campvus account.</p>
      <form onSubmit={(event) => { void handleLoginSubmit(event) }}>
        <label>
          Campvus server URL
          <input type="text" name="modeBUrl" placeholder="https://campvus.example.edu" required value={modeBUrl} onChange={(e) => setModeBUrl(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <div className="input-with-action">
            <input type={showPassword ? 'text' : 'password'} name="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="input-action" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeSlash aria-hidden /> : <Eye aria-hidden />}
            </button>
          </div>
        </label>

        {loginError !== undefined && <p className="error"><WarningCircle aria-hidden /> <span>{loginError}</span></p>}
        {loginStatus !== undefined && <p className="muted">{loginStatus}</p>}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={signingIn}>Sign in</button>
        </div>
      </form>

      <h2>Settings</h2>
      <form onSubmit={(event) => { void handleSettingsSubmit(event) }}>
        <label>
          Course IDs <span className="muted">(comma-separated — you&apos;re usually enrolled in more than one)</span>
          <input type="text" name="courseIds" placeholder="COMSCI214, MATH101" required value={settings.courseIds} onChange={updateField('courseIds')} />
        </label>
        <label>
          Institution public key (hex)
          <input type="text" name="institutionPublicKeyHex" className="mono" required value={settings.institutionPublicKeyHex} onChange={updateField('institutionPublicKeyHex')} />
        </label>
        <label>
          Origin URL <span className="muted">(optional)</span>
          <input type="text" name="originUrl" placeholder="https://lms.example.edu" value={settings.originUrl} onChange={updateField('originUrl')} />
        </label>
        <label>
          Manifest origin URL <span className="muted">(optional — catches up on manifests published while offline)</span>
          <input type="text" name="manifestOriginUrl" placeholder="https://lms.example.edu" value={settings.manifestOriginUrl} onChange={updateField('manifestOriginUrl')} />
        </label>
        <label>
          Region <span className="muted">(optional, Tier 2)</span>
          <input type="text" name="region" placeholder="e.g. campus-west" value={settings.region} onChange={updateField('region')} />
        </label>
        <label>
          Max store size in bytes <span className="muted">(optional)</span>
          <input type="text" name="maxStoreBytes" placeholder="e.g. 5000000000" value={settings.maxStoreBytes} onChange={updateField('maxStoreBytes')} />
        </label>

        {settingsError !== undefined && <p className="error"><WarningCircle aria-hidden /> <span>{settingsError}</span></p>}

        <div className="row">
          <button type="submit" className="btn btn-primary"><Check aria-hidden /> Save</button>
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
        </div>
      </form>
    </section>
  )
}
