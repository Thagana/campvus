import { CampvusApi } from './preload-api'

declare global {
  interface Window {
    campvus: CampvusApi
  }
}

export {}
