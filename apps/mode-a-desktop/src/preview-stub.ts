// TEMPORARY — visual QA harness only, not part of the app. Stubs
// window.campvus so renderer.ts can run in a plain browser tab (same
// index.css/renderer.ts the real Electron window uses) without booting
// Electron, so the responsive layout can be screenshotted at arbitrary
// viewport sizes. Delete this file and preview.html/preview-entry.ts when
// done.
import type { CampvusApi, AppState, CourseFile, PartialDesktopConfig } from './preload-api'

const state: AppState = { status: 'syncing', peerCount: 4, seedingAllowed: true, configured: true }
const listeners: Array<(s: AppState) => void> = []

const config: PartialDesktopConfig = {
  courseIds: ['COMSCI214', 'MATH101', 'ENGL220'],
  institutionPublicKeyHex: 'a'.repeat(64),
}

function file (courseId: string, filename: string, size: number, downloaded: boolean): CourseFile {
  return { courseId, filename, hash: Math.random().toString(16).slice(2).padEnd(64, '0'), size, timestamp: Date.now(), downloaded }
}

const files: CourseFile[] = [
  file('COMSCI214', 'Lecture 12 - Distributed Systems and the CAP Theorem.pdf', 3_400_000, true),
  file('COMSCI214', 'homework-3-starter-code-with-a-really-long-filename-to-test-truncation.zip', 120_000, false),
  file('COMSCI214', 'midterm-review-slides.pdf', 2_100_000, true),
  file('COMSCI214', 'lecture-13-recording.mp4', 240_000_000, false),
  file('MATH101', 'syllabus.pdf', 88_000, true),
  file('MATH101', 'problem-set-4.pdf', 210_000, true),
  file('MATH101', 'problem-set-5.pdf', 198_000, false),
  file('ENGL220', 'essay-prompt-2.docx', 45_000, true),
  file('ENGL220', 'reading-list-fall.pdf', 310_000, true),
  file('ENGL220', 'week-9-annotated-excerpt.pdf', 560_000, false),
]

const api: CampvusApi = {
  getState: async () => state,
  onStateChange: (handler) => { listeners.push(handler); return () => {} },
  getConfig: async () => config,
  saveConfig: async () => ({ ok: true }),
  loginModeB: async () => ({ ok: false, error: 'Preview stub — sign-in is not wired up.' }),
  getCourseFiles: async () => files,
  openCourseFile: async () => ({ ok: true }),
}

;(window as unknown as { campvus: CampvusApi }).campvus = api
