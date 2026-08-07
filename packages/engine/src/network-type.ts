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
// module or NAPI binding needed, just a spawned process). Smoke-tested on
// real Windows hardware (see ADR-0004/README).
//
// macOS: the equivalent first-party concept is Network.framework's
// NWPathMonitor — `path.isExpensive` (cellular/Personal-Hotspot-style) and
// `path.isConstrained` (user-enabled Low Data Mode) are exactly the two
// signals Windows' ConnectionCost bundles together. There's no PowerShell
// equivalent shipped by every Mac, but `swift` (from Xcode Command Line
// Tools) can reach the framework the same way PowerShell reaches WinRT —
// so this only degrades to "unknown" (same fail-safe contract as before)
// on a Mac without developer tools installed, not on every Mac.
// CAVEAT: written and reviewed against Apple's documented NWPathMonitor
// API, but not run on real macOS hardware in this environment.
//
// Linux: no single first-party API, but NetworkManager (the default on
// most desktop distros — Ubuntu, Fedora, Debian+GNOME) exposes a
// `connection.metered` property per-connection via `nmcli`, already
// resolved to an effective yes/no by NetworkManager's own heuristics
// (mirrors what GNOME/KDE's own "mobile hotspot" indicators read). Falls
// back to unknown wherever `nmcli`/`ip` aren't present (e.g. servers,
// minimal WMs, systemd-networkd-only setups) — same fail-safe contract.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

// `swift -` (reading from stdin) would avoid the temp-file dance, but
// execFile has no stdin-piping option short of manually driving
// child.stdin — a temp file keeps this the same shape as the Windows path.
const MACOS_METERED_CHECK_SCRIPT = `
import Network
import Foundation

let monitor = NWPathMonitor()
let queue = DispatchQueue(label: "campvus-network-check")
monitor.pathUpdateHandler = { path in
  print(path.isExpensive || path.isConstrained)
  exit(0)
}
monitor.start(queue: queue)

// NWPathMonitor's first update is normally near-instant, but this is a
// belt-and-suspenders exit so a wedged monitor can't hang the caller past
// its own execFile timeout.
queue.asyncAfter(deadline: .now() + 3) {
  print("unknown")
  exit(0)
}

dispatchMain()
`.trim()

async function checkMacMetered (): Promise<boolean | null> {
  const scriptPath = path.join(os.tmpdir(), `campvus-network-check-${process.pid}.swift`)
  try {
    fs.writeFileSync(scriptPath, MACOS_METERED_CHECK_SCRIPT)
    const { stdout } = await execFileAsync('swift', [scriptPath], { timeout: 8000 })
    const result = stdout.trim().toLowerCase()
    if (result === 'true') return true
    if (result === 'false') return false
    return null // 'unknown', or unrecognized output
  } catch {
    return null // no Xcode Command Line Tools, script failed, timed out, etc.
  } finally {
    fs.rmSync(scriptPath, { force: true })
  }
}

async function checkLinuxMetered (): Promise<boolean | null> {
  try {
    const { stdout: routeOut } = await execFileAsync('ip', ['-4', 'route', 'show', 'default'], { timeout: 5000 })
    const iface = routeOut.match(/\bdev\s+(\S+)/)?.[1]
    if (!iface) return null

    const { stdout } = await execFileAsync(
      'nmcli', ['-t', '-f', 'GENERAL.METERED', 'device', 'show', iface],
      { timeout: 5000 }
    )
    const value = stdout.trim().split(':')[1]?.trim().toLowerCase()
    if (value === 'yes' || value === 'guess-yes') return true
    if (value === 'no' || value === 'guess-no') return false
    return null // 'unknown', or nmcli/NetworkManager not present
  } catch {
    return null // no `ip`/`nmcli` (e.g. no NetworkManager), timed out, etc.
  }
}

// true = metered, false = unmetered, null = undeterminable on this platform
// or the OS call itself failed. Callers must treat null as "unknown," never
// as "not metered" — see networkAwareSeedingPolicy's default in
// seeding-policy.ts.
export async function isConnectionMetered (): Promise<boolean | null> {
  if (process.platform === 'win32') return checkWindowsMetered()
  if (process.platform === 'darwin') return checkMacMetered()
  if (process.platform === 'linux') return checkLinuxMetered()
  return null
}
