# Builds and runs Mode B only (apps/mode-b-api + apps/mode-b-web). In
# production this is a single process: mode-b-api serves its own API routes
# and mode-b-web's built static assets, same-origin (see
# apps/mode-b-api/src/server.ts and apps/mode-b-web/README.md). Mode A
# (apps/mode-a-desktop, apps/mode-a-headless, apps/campvus) isn't part of
# this image at all.
#
# Neither node:sqlite (built into Node) nor @node-rs/argon2 nor hyperswarm's
# native deps need a compile step on Linux x64/arm64 — all ship prebuilt
# binaries — so no build toolchain (python3/make/g++) is required here.

FROM node:24-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app

# Copy just the workspace manifests first so `pnpm install` is cached
# across builds that only change application source. pnpm-lock.yaml records
# every workspace member (all of apps/*, packages/*), so --frozen-lockfile
# needs all of their package.json files present. pnpm-workspace.yaml sets
# nodeLinker: hoisted, which flattens all workspace deps into one root
# node_modules — `pnpm install --filter` doesn't shrink that (verified: it
# still pulls in Electron/Expo from the other apps), so there's no cheaper
# partial-install option here. Only mode-b-api/mode-b-web/engine/design get
# their source copied below and actually built/run.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/mode-b-api/package.json apps/mode-b-api/package.json
COPY apps/mode-b-web/package.json apps/mode-b-web/package.json
COPY apps/mode-a-desktop/package.json apps/mode-a-desktop/package.json
COPY apps/mode-a-headless/package.json apps/mode-a-headless/package.json
COPY apps/campvus/package.json apps/campvus/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/design/package.json packages/design/package.json

RUN pnpm install --frozen-lockfile

COPY apps/mode-b-api apps/mode-b-api
COPY apps/mode-b-web apps/mode-b-web
COPY packages/engine packages/engine
COPY packages/design packages/design

RUN pnpm --filter @campvus/mode-b-web build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
# Persistent state (institution keypair, content-store/, SQLite db) lives
# here instead of alongside the app code, so a mounted Fly volume at this
# path doesn't shadow the code that needs to run — see fly.toml [mounts]
# and apps/mode-b-api/src/paths.ts.
ENV DATA_DIR=/data
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/apps/mode-b-api ./apps/mode-b-api
COPY --from=builder /app/apps/mode-b-web/dist ./apps/mode-b-web/dist
COPY --from=builder /app/apps/mode-b-web/package.json ./apps/mode-b-web/package.json
COPY --from=builder /app/packages ./packages

RUN mkdir -p /data

EXPOSE 3000
WORKDIR /app/apps/mode-b-api
CMD ["/app/node_modules/.bin/tsx", "src/index.ts"]
