# Myth of Rune — AGENTS.md

## Quick start

```bash
# Copy env, start infra, migrate, launch servers
copy .env.example .env
docker compose up postgres redis -d
npm run migrate
npm run dev
```

Single service: `npm run dev:login|dev:gateway|dev:world|dev:combat|dev:web`

## Build order

`shared` must be built before its consumers. Dockerfiles do this explicitly:
```
npm run build -w @myth-of-rune/shared && npm run build -w <target>
```

## Commands

| What | How |
|------|-----|
| Build all | `npm run build` |
| Dev all | `npm run dev` (4 servers) or `npm run dev:all` (+ web-client) |
| DB migrate | `npm run migrate` |
| Test (world-server only) | `npm run test -w world-server` |
| Health check | `npm run check:health` (gateway) or `npm run check:health:all` (all) |
| Docker stack | `npm run docker:up` / `npm run docker:down` |

**No lint, no typecheck script.** TypeScript strict via `tsconfig.base.json`. `npm run build` is the closest to a type-check.

## Testing

Uses Node native `node:test` + `node:assert/strict`. Tests live alongside source as `*.test.ts`. Build before running:
```
npm run build -w world-server && node --test dist/world/*.test.js
```
The `npm run test -w world-server` script does this automatically.

## Architecture

- **`shared/`** — Zod schemas (`src/schemas/`), game constants, combat rules, items, runes, quests, recipes, skills, maps. Single source of truth; services import from `@myth-of-rune/shared`.
- **`gateway/`** — Express reverse proxy (port 3000). Only port exposed to clients. Proxies `/auth/*` → login, `/ws` → world, `/combat` → combat. Aliases: `/login` → `/auth/login`, `/register` → `/auth/register`.
- **`login-server/`** — Postgres accounts, bcrypt, JWT. Migrations via `src/migrate.ts`.
- **`world-server/`** — WebSocket (ws@8), per-map rooms, Redis for ephemeral state, mob AI. `MAP_BOUNDS` defines playable area.
- **`combat-server/`** — Combat logic, integrates with world via Redis.
- **`web-client/`** — Phaser 3 + Vite on :5173. Vite env vars: `VITE_GATEWAY_HTTP_URL`, `VITE_GATEWAY_WS_URL`.

## Ports

| Service | Local dev | Docker |
|---------|-----------|--------|
| Gateway | 3000 | 3000 (published) |
| Login | 3001 | internal only |
| World | 3002 | internal only |
| Combat | 3003 | internal only |
| Postgres | 5432 | internal |
| Redis | 6379 | internal |
| Web client | 5173 | host only |

## Key conventions

- **No `.env` in git** — copy `.env.example` and set `JWT_SECRET`, `GM_SECRET` for local dev.
- **WebSocket** connects to gateway at `/ws?token=...` (token in query string).
- **Map play area**: 800×600 game units (constant in world-server).
- **2 clients** exist: Godot 4 (`client/` — not in this repo) + Phaser/TypeScript (`web-client/`).
- **Tools** in `tools/` are Python/JS asset pipeline helpers; not game code.
- **No interface-with-one-implementation.** Avoid speculative abstractions.
