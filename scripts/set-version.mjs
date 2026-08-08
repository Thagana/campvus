#!/usr/bin/env node
// Syncs the `version` field across every workspace package.json (root,
// apps/*, packages/*) ahead of cutting a release. See
// docs/agents/release-process.md for when/how this is run.
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/set-version.mjs <X.Y.Z>');
  process.exit(1);
}

const manifestPaths = [
  path.join(repoRoot, 'package.json'),
  ...await Array.fromAsync(glob('apps/*/package.json', { cwd: repoRoot })),
  ...await Array.fromAsync(glob('packages/*/package.json', { cwd: repoRoot })),
].map((p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p)));

for (const manifestPath of manifestPaths) {
  const raw = await readFile(manifestPath, 'utf8');
  const trailingNewline = raw.endsWith('\n');
  const manifest = JSON.parse(raw);
  if (manifest.version === undefined) continue;
  manifest.version = version;
  const next = JSON.stringify(manifest, null, 2) + (trailingNewline ? '\n' : '');
  await writeFile(manifestPath, next);
  console.log(`${path.relative(repoRoot, manifestPath)} -> ${version}`);
}
