// Manual smoke test, not part of the automated suite — mirrors
// lan-discovery-e2e.manual.ts's pattern. Two real createSwarmNode
// instances, one process, both joining the same course topic over actual
// Hyperswarm (DHT + LAN mDNS) exactly the way two separate devices would.
// The "teacher" node (holds the institution keypair) starts a live
// session and publishes a handful of fake segments; the "student" node
// (no keypair — just like a real student's client) should receive them
// via flood-gossip relay with no direct request, then the teacher
// finishes the session and its recording gets published as an ordinary
// signed manifest through the existing file pipeline.
//
// Segment cadence here is deliberately fast (500ms, not the spec's real
// ~6-10s) so this finishes in seconds rather than minutes — this is a
// protocol smoke test, not a realistic timing simulation.
//
// Run directly: npx tsx test/live-session-e2e.manual.ts

import fs from 'fs'
import path from 'path'
import os from 'os'
import nacl from 'tweetnacl'
import b4a from 'b4a'
import { resolvePaths, Paths } from '../src/paths'
import { createSwarmNode } from '../src/swarm-node'
import { readContent } from '../src/content-store'
import { Keypair } from '../src/types'

function tmpPaths (label: string): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `campvus-live-e2e-${label}-`))
  return resolvePaths(rootDir)
}

const COURSE_ID = 'DEMO101'
const SEGMENT_COUNT = 5

async function main (): Promise<void> {
  const nacKeypair = nacl.sign.keyPair()
  const keypair: Keypair = { publicKey: nacKeypair.publicKey, secretKey: nacKeypair.secretKey }
  const publicKeyHex = b4a.toString(keypair.publicKey, 'hex')

  const teacherPaths = tmpPaths('teacher')
  const studentPaths = tmpPaths('student')

  let receivedSegments = 0
  let sawSessionStart = false

  const teacher = createSwarmNode({
    courseIds: [COURSE_ID],
    contentDir: path.join(teacherPaths.rootDir, 'content'),
    publicKeyHex,
    paths: teacherPaths,
    keypair,
    log: (line) => console.log(`[TEACHER] ${line}`)
  })

  const student = createSwarmNode({
    courseIds: [COURSE_ID],
    contentDir: path.join(studentPaths.rootDir, 'content'),
    publicKeyHex,
    paths: studentPaths,
    log: (line) => console.log(`[STUDENT] ${line}`)
  })

  teacher.onPeerCountChange((count) => {
    if (count > 0) teacherHasPeer = true
  })

  student.onSessionStart((session) => {
    sawSessionStart = true
    console.log(`[STUDENT] *** session-start received: ${session.sessionId} for ${session.courseId} ***`)
  })
  student.onSegment((segment, bytes) => {
    receivedSegments++
    console.log(`[STUDENT] *** segment ${segment.seq} received (${bytes.length} bytes): "${bytes.toString('utf8')}" ***`)
  })

  await teacher.start()
  await student.start()

  console.log('\nBoth nodes started, waiting up to 10s to discover each other...')
  const connected = await waitFor(() => teacherHasPeer, 10000)
  console.log(connected ? 'Connected.' : 'Did not confirm connection within 10s — continuing anyway.')

  console.log(`\nTeacher starting a live session for ${COURSE_ID}...`)
  const session = teacher.startLiveSession(COURSE_ID)
  console.log(`Session id: ${session.sessionId}`)

  for (let seq = 0; seq < SEGMENT_COUNT; seq++) {
    const bytes = Buffer.from(`segment-${seq}-content`)
    teacher.publishSegment(session.sessionId, COURSE_ID, seq, bytes)
    console.log(`[TEACHER] published segment ${seq}`)
    await sleep(500)
  }

  console.log('\nWaiting up to 5s for the student to catch up on any late-arriving segments...')
  await waitFor(() => receivedSegments >= SEGMENT_COUNT, 5000)

  const { manifest } = teacher.finishLiveSession(session.sessionId, 'live-demo-recording.txt')
  const recordedBytes = readContent(teacherPaths.contentStoreDir, manifest.hash)
  console.log(`\n[TEACHER] recording published as manifest hash ${manifest.hash.slice(0, 12)}... (${recordedBytes.length} bytes)`)
  console.log(`[TEACHER] recording content: "${recordedBytes.toString('utf8')}"`)

  await teacher.stop()
  await student.stop()

  console.log(`\n=== Result ===`)
  console.log(`session-start received by student: ${sawSessionStart}`)
  console.log(`segments received by student: ${receivedSegments}/${SEGMENT_COUNT}`)
  const ok = sawSessionStart && receivedSegments === SEGMENT_COUNT
  console.log(ok ? 'PASS' : 'FAIL — student did not receive everything the teacher published')
  process.exit(ok ? 0 : 1)
}

let teacherHasPeer = false
function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
async function waitFor (check: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (check()) return true
    await sleep(200)
  }
  return check()
}

main().catch((err) => { console.error(err); process.exit(1) })
