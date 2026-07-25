// Institution keypair handling.
//
// In production this keypair's SECRET half never touches application code —
// it lives in a KMS/HSM (AWS KMS, etc.) and signing happens via an API call.
// For this MVP spike we persist it to a local JSON file so the whole flow
// is runnable end to end on a laptop. Swapping this module for a KMS-backed
// signer later should not require changing anything else in the system.

const fs = require('fs')
const nacl = require('tweetnacl')
const b4a = require('b4a')
const { resolvePaths } = require('../config/paths')

function generateAndSaveKeypair (paths = resolvePaths()) {
  const kp = nacl.sign.keyPair()
  const record = {
    publicKey: b4a.toString(kp.publicKey, 'hex'),
    secretKey: b4a.toString(kp.secretKey, 'hex')
  }
  fs.writeFileSync(paths.keyFile, JSON.stringify(record, null, 2))
  return record
}

function loadKeypair (paths = resolvePaths()) {
  if (!fs.existsSync(paths.keyFile)) {
    throw new Error(`No institution keypair found at ${paths.keyFile}. Run: node src/identity.js generate`)
  }
  const record = JSON.parse(fs.readFileSync(paths.keyFile, 'utf8'))
  return {
    publicKey: b4a.from(record.publicKey, 'hex'),
    secretKey: b4a.from(record.secretKey, 'hex')
  }
}

function loadPublicKeyHex (paths = resolvePaths()) {
  const record = JSON.parse(fs.readFileSync(paths.keyFile, 'utf8'))
  return record.publicKey
}

module.exports = { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex }
