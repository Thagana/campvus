// Shared shapes for the manifest/signing engine.

export interface ManifestFields {
  courseId: string
  filename: string
  hash: string
  size: number
  timestamp: number
}

export interface SignedManifest extends ManifestFields {
  signature: string
}

// What verifyManifest actually receives: untrusted wire data that may be
// missing or have tampered with its signature — never assume it's a valid
// SignedManifest before checking.
export type ManifestInput = ManifestFields & { signature?: string }

export interface Keypair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}
