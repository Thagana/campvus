import fs from 'fs'
import path from 'path'
import os from 'os'
import { FastifyInstance } from 'fastify'
import { resolvePaths, Paths, generateAndSaveKeypair, loadKeypair } from '@campvus/engine'
import { openDb, Db } from '../src/db/client'
import { buildServer } from '../src/server'

export function tmpPaths (): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-b-api-test-'))
  return resolvePaths(rootDir)
}

export async function createTestApp (): Promise<{ app: FastifyInstance, db: Db }> {
  const paths = tmpPaths()
  generateAndSaveKeypair(paths)
  const keypair = loadKeypair(paths)
  const { db } = openDb(':memory:')
  const app = await buildServer({ db, paths, keypair })
  return { app, db }
}

interface InjectResponseLike {
  cookies: { name: string, value: string }[]
}

export function sessionCookieHeader (res: InjectResponseLike): string {
  const cookie = res.cookies.find(c => c.name === 'campvus_session')
  if (!cookie) throw new Error('no session cookie in response')
  return `campvus_session=${cookie.value}`
}

export async function registerUser (app: FastifyInstance, email: string, password = 'hunter2'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password } })
  return sessionCookieHeader(res)
}

export function multipartBody (
  filename: string,
  content: Buffer,
  boundary = 'testboundary123'
): { body: Buffer, contentType: string } {
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n'
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}
