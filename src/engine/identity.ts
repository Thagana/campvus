// Institution keypair handling.
//
// In production this keypair's SECRET half never touches application code —
// it lives in a KMS/HSM (AWS KMS, etc.) and signing happens via an API call.
// For this MVP spike we persist it to a local JSON file so the whole flow
// is runnable end to end on a laptop. Swapping this module for a KMS-backed
// signer later should not require changing anything else in the system.

import fs from 'fs'
import nacl from 'tweetnacl'
import b4a from 'b4a'
import { resolvePaths, Paths } from '../config/paths'
import { Keypair } from './types'

interface KeypairRecord {
  publicKey: string
  secretKey: string
}

export function generateAndSaveKeypair (paths: Paths = resolvePaths()): KeypairRecord {
  const kp = nacl.sign.keyPair()
  const record: KeypairRecord = {
    publicKey: b4a.toString(kp.publicKey, 'hex'),
    secretKey: b4a.toString(kp.secretKey, 'hex')
  }
  fs.writeFileSync(paths.keyFile, JSON.stringify(record, null, 2))
  return record
}

export function loadKeypair (paths: Paths = resolvePaths()): Keypair {
  if (!fs.existsSync(paths.keyFile)) {
    throw new Error(`No institution keypair found at ${paths.keyFile}. Run: node src/identity.ts generate`)
  }
  const record: KeypairRecord = JSON.parse(fs.readFileSync(paths.keyFile, 'utf8'))
  return {
    publicKey: b4a.from(record.publicKey, 'hex'),
    secretKey: b4a.from(record.secretKey, 'hex')
  }
}

export function loadPublicKeyHex (paths: Paths = resolvePaths()): string {
  const record: KeypairRecord = JSON.parse(fs.readFileSync(paths.keyFile, 'utf8'))
  return record.publicKey
}
