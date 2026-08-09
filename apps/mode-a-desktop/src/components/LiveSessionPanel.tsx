import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Broadcast, Record, StopCircle, WarningCircle } from '@phosphor-icons/react'
import type { LiveCourse, LiveEvent, LiveSessionInfo } from '../preload-api'

// Real capture/playback (ADR-0007's signing-proxy design + ticket 07's
// flood-gossip/segment design), not a synthetic demo: this device's camera
// and mic via getUserMedia/MediaRecorder for the source, and MediaSource
// for playback of whatever arrives over the swarm — both are plain
// Chromium web APIs Electron already ships, no new native dependency.
//
// Known limitation, not solved here: the codec MediaRecorder actually
// picks and the one MediaSource expects on the receiving side aren't
// negotiated over the wire anywhere (SignedSessionStart's signed fields
// are fixed-shape — see live-segment-protocol.ts — so there's no room for
// a mimeType field without changing what gets signed). Both sides run the
// same fallback candidate list independently, which agrees in the common
// case (two Electron/Chromium builds), but isn't a real negotiation.
const MIME_CANDIDATES = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
const SEGMENT_MS = 6000 // ~6-10s per the spec's design decision (ticket 07)

function pickMimeType (isSupported: (type: string) => boolean): string {
  return MIME_CANDIDATES.find(isSupported) ?? 'video/webm'
}

export function LiveSessionPanel ({ onClose }: { onClose: () => void }) {
  const [courses, setCourses] = useState<LiveCourse[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [activeSession, setActiveSession] = useState<LiveSessionInfo>()
  const [publishedCount, setPublishedCount] = useState(0)
  const [startError, setStartError] = useState<string>()
  const [finishing, setFinishing] = useState(false)

  const [liveNotice, setLiveNotice] = useState<LiveSessionInfo>()
  const [receivedCount, setReceivedCount] = useState(0)
  const [playbackError, setPlaybackError] = useState<string>()

  const previewRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const recorderRef = useRef<MediaRecorder | undefined>(undefined)

  // Buffers segments that arrive before the SourceBuffer exists yet or
  // while a previous appendBuffer() call is still in flight — appendBuffer
  // throws if called again before 'updateend' fires for the last one.
  const sourceBufferRef = useRef<SourceBuffer | undefined>(undefined)
  const appendQueueRef = useRef<ArrayBuffer[]>([])

  useEffect(() => {
    window.campvus.listMyCourses().then((list) => {
      setCourses(list)
      const firstTeaching = list.find((c) => c.role === 'teacher')
      if (firstTeaching) setSelectedCourseId(firstTeaching.id)
    })
  }, [])

  useEffect(() => {
    return window.campvus.onLiveEvent((event: LiveEvent) => {
      if (event.type === 'session-start') {
        setLiveNotice(event.session)
        setReceivedCount(0)
        setPlaybackError(undefined)
        resetPlayback(event.session.sessionId)
        return
      }
      // A segment from a session this panel hasn't seen a session-start
      // for yet (e.g. this window opened mid-session) — still play it,
      // just without the "who/when" banner.
      if (!sourceBufferRef.current && !liveNotice) {
        resetPlayback(event.sessionId)
      }
      appendQueueRef.current.push(event.bytes)
      setReceivedCount((n) => n + 1)
      drainAppendQueue()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function resetPlayback (sessionId: string): void {
    void sessionId
    sourceBufferRef.current = undefined
    appendQueueRef.current = []
    const video = playbackRef.current
    if (!video) return
    const mediaSource = new MediaSource()
    video.src = URL.createObjectURL(mediaSource)
    mediaSource.addEventListener('sourceopen', () => {
      try {
        const mimeType = pickMimeType((t) => MediaSource.isTypeSupported(t))
        const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
        sourceBuffer.addEventListener('updateend', drainAppendQueue)
        sourceBufferRef.current = sourceBuffer
        drainAppendQueue()
      } catch (err) {
        setPlaybackError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function drainAppendQueue (): void {
    const sourceBuffer = sourceBufferRef.current
    if (!sourceBuffer || sourceBuffer.updating) return
    const next = appendQueueRef.current.shift()
    if (!next) return
    try {
      sourceBuffer.appendBuffer(next)
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleGoLive (): Promise<void> {
    setStartError(undefined)
    const result = await window.campvus.startLiveSession(selectedCourseId)
    if (!result.ok) {
      setStartError(result.error)
      return
    }
    setActiveSession(result.session)
    setPublishedCount(0)
    await startCapture(result.session)
  }

  async function startCapture (session: LiveSessionInfo): Promise<void> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    } catch (err) {
      setStartError(`Could not access camera/microphone: ${err instanceof Error ? err.message : String(err)}`)
      setActiveSession(undefined)
      return
    }
    streamRef.current = stream
    if (previewRef.current) previewRef.current.srcObject = stream

    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t))
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return
      void e.data.arrayBuffer().then((bytes) => {
        void window.campvus.publishLiveSegment({ sessionId: session.sessionId, courseId: session.courseId, bytes }).then((result) => {
          if (result.ok) setPublishedCount((n) => n + 1)
          else setStartError(result.error)
        })
      })
    }
    recorderRef.current = recorder
    recorder.start(SEGMENT_MS)
  }

  async function handleEndSession (): Promise<void> {
    if (!activeSession) return
    recorderRef.current?.stop()
    recorderRef.current = undefined
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = undefined
    if (previewRef.current) previewRef.current.srcObject = null

    setFinishing(true)
    const result = await window.campvus.finishLiveSession({
      sessionId: activeSession.sessionId,
      courseId: activeSession.courseId,
      filename: `live-session-${activeSession.sessionId}.webm`
    })
    setFinishing(false)
    if (!result.ok) setStartError(result.error)
    setActiveSession(undefined)
  }

  const teachingCourses = courses.filter((c) => c.role === 'teacher')

  return (
    <section className="card">
      <h2>Live session</h2>

      {teachingCourses.length > 0 && !activeSession && (
        <div className="detail-list">
          <label>
            Course
            <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
              {teachingCourses.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => { void handleGoLive() }}>
            <Broadcast aria-hidden /> Go live
          </button>
        </div>
      )}

      {activeSession && (
        <div className="detail-list">
          <p className="muted"><Record aria-hidden data-status="error" /> Live now — {activeSession.courseId} ({publishedCount} segment{publishedCount === 1 ? '' : 's'} published)</p>
          <video ref={previewRef} autoPlay muted playsInline style={{ width: '100%', borderRadius: 8 }} />
          <button type="button" className="btn btn-secondary" disabled={finishing} onClick={() => { void handleEndSession() }}>
            <StopCircle aria-hidden /> {finishing ? 'Publishing recording…' : 'End session'}
          </button>
        </div>
      )}

      {startError !== undefined && <p className="error"><WarningCircle aria-hidden /> <span>{startError}</span></p>}

      <h3>What's live now</h3>
      {liveNotice === undefined && <p className="muted">Nothing live right now.</p>}
      {liveNotice !== undefined && (
        <div className="detail-list">
          <p className="muted"><Broadcast aria-hidden /> {liveNotice.courseId} is live ({receivedCount} segment{receivedCount === 1 ? '' : 's'} received)</p>
          <video ref={playbackRef} autoPlay controls playsInline style={{ width: '100%', borderRadius: 8 }} />
        </div>
      )}
      {playbackError !== undefined && <p className="error"><WarningCircle aria-hidden /> <span>{playbackError}</span></p>}

      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onClose}><ArrowLeft aria-hidden /> Close</button>
      </div>
    </section>
  )
}
