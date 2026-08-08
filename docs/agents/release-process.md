# Release Process

How releases are branched, versioned, and turned into build artifacts.

## Branch model

```
master
  └── release/vX.Y.Z        (cut from master)
        └── feature/foo      (cut from the release branch, merged back into it)
```

- `master` is always deployable. It only moves forward via a release branch merge.
- `release/vX.Y.Z` is where a release stabilizes. Branch it from `master` when starting work toward version `X.Y.Z`.
- `feature/*` branches (e.g. `feature/live-video`) branch off the active release branch and merge back into it via PR — not into `master` directly.

## Cutting a release

1. All intended `feature/*` branches are merged into `release/vX.Y.Z`.
2. Sync the version across every workspace `package.json` (root, `apps/*`, `packages/*`):
   ```
   pnpm version:set X.Y.Z
   git commit -am "release: vX.Y.Z"
   ```
3. Merge `release/vX.Y.Z` into `master` (PR or fast-forward merge).
4. On `master`, tag the merge commit and push the tag:
   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The version is single-synced: every workspace package carries the same `X.Y.Z`, even packages with no independent release cadence of their own (e.g. `@campvus/engine`). This keeps `vX.Y.Z` unambiguous — it names one exact state of the whole repo, not a per-app version.

## What tagging triggers

Pushing a tag matching `v*.*.*` runs `.github/workflows/desktop-ci.yml`'s `release` job: it builds `apps/mode-a-desktop` on Windows, macOS, and Linux, then publishes a GitHub Release for the tag with the installers/packages attached (`.exe`/`.nupkg`/`RELEASES`, `.zip`, `.deb`, `.rpm`).

Mode B (`apps/mode-b-api` + `apps/mode-b-web`) isn't part of this release-artifact pipeline — it deploys straight from the Dockerfile (see `Dockerfile`'s comments) rather than via tagged, published artifacts.

If Mode A headless or the mobile app (`apps/campvus`) ever need packaged release artifacts too, extend `desktop-ci.yml`'s `build`/`release` jobs rather than creating a parallel workflow — one release tag should still produce one GitHub Release with everything attached.
