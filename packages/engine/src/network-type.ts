// Real, OS-level "is this connection metered?" detection — the capability
// seeding-policy.ts's comments used to call impossible "in plain Node.js on
// a laptop." It isn't impossible; it just needs a platform-specific call
// per OS, shelled out to rather than requiring a compiled native module.
//
// Windows: PowerShell can reach the WinRT
// Windows.Networking.Connectivity.NetworkInformation API, which exposes the
// same "metered connection" concept Windows' own network settings UI shows
// (cellular, mobile hotspot, or a Wi-Fi/Ethernet network the user marked as
// metered) — verified against community references reproducing Microsoft's
// own NetworkInformation/ConnectionCost API shape (no compiled native
// module or NAPI binding needed, just a spawned process).
//
// macOS/Linux: no equivalent OS concept exists to call — always unknown
// today (see isConnectionMetered's return contract below).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const WINDOWS_METERED_CHECK_SCRIPT = `
$null = [Windows.Networking.Connectivity.NetworkInformation, Windows, ContentType = WindowsRuntime]
$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($null -eq $profile) { Write-Output 'unknown'; exit }
$cost = $profile.GetConnectionCost()
$metered = $cost.ApproachingDataLimit -or $cost.OverDataLimit -or $cost.Roaming -or $cost.BackgroundDataUsageRestricted -or ($cost.NetworkCostType -notin @('Unrestricted', 'Unknown'))
Write-Output $metered
`.trim()

async function checkWindowsMetered (): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_METERED_CHECK_SCRIPT],
      { timeout: 5000 }
    )
    const result = stdout.trim().toLowerCase()
    if (result === 'true') return true
    if (result === 'false') return false
    return null // 'unknown', or unrecognized output
  } catch {
    return null // PowerShell missing, WinRT call failed, timed out, etc.
  }
}

// true = metered, false = unmetered, null = undeterminable on this platform
// or the OS call itself failed. Callers must treat null as "unknown," never
// as "not metered" — see networkAwareSeedingPolicy's default in
// seeding-policy.ts.
export async function isConnectionMetered (): Promise<boolean | null> {
  if (process.platform === 'win32') return checkWindowsMetered()
  return null
}
