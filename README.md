# Footy Manager

A deep, realistic **football-management simulation for mobile** (iOS + Android). Take over a real-world club, manage squad / tactics / coaches / finances, and play an open-ended career across ~30 global leagues with realistic results, transfers, injuries and youth development — where **tactics genuinely decide matches**.

> **Status:** Phase 0 (foundations & contracts) implemented — pnpm monorepo, canonical contracts in `packages/shared`, deterministic engine core + CI determinism gate in `packages/engine`, seed.db pipeline in `packages/data`, Expo (SDK 57) app shell in `apps/mobile`. See `docs/PLAN.md` §15 for the roadmap.

## Quick start

```sh
pnpm install          # workspace install (pnpm 10; node-linker=hoisted for RN)
pnpm test             # all package test suites (incl. the determinism gate)
pnpm typecheck        # tsc --noEmit across packages
pnpm build:seed       # builds packages/data/out/seed.db + copies to apps/mobile/assets/db
```

Engine golden baseline (only when sampling logic intentionally changes):
`pnpm --filter @footy/engine golden` — regenerates `packages/engine/test/golden.json`, which CI recomputes on ubuntu/windows/macos and must match byte-for-byte.

## Tech stack (decided)

| Layer | Choice |
|---|---|
| App | **React Native + Expo + TypeScript** (mobile-first; desktop later via same core) |
| 2D pitch | **`@shopify/react-native-skia`** |
| DB / saves | **`expo-sqlite`** (embedded, per-slot save files) |
| State / animation | **Zustand** + **Reanimated** |
| Sim engine | **Pure-TypeScript** deterministic core (`packages/engine`), run off the UI thread; optional Rust native-module fallback |
| Build | **Expo dev client + `expo prebuild` / EAS** from day one (NOT Expo Go) |

## Documents

- **`docs/PLAN.md`** — the full, execution-ready build plan: architecture, canonical contracts, SQLite schema, all subsystem designs with formulas, the MVP-first roadmap, risks, and verification. **Start here.**
- **`docs/RESEARCH.md`** — the verified, adversarially-checked research the plan is grounded in (data-source licensing, rating models, match-engine techniques, transfer/injury modelling), with sources and open questions.

## How to continue (with Fable)

1. Open this folder in a fresh Claude Code session (switch model to **Fable** with `/model`).
2. Ask it to read `docs/PLAN.md` and `docs/RESEARCH.md`, then begin **Phase 0** (§15 of the plan): lock the canonical contracts in `packages/shared`, scaffold the monorepo + Expo dev client, build the `seed.db` pipeline, and stand up the determinism CI gate.
3. Proceed through the roadmap phase by phase; each phase has an explicit **acceptance gate**.

## Key constraints to remember

- **Legal:** no free source can ship real player photos/data → the bundled game is **license-safe** (generated players/avatars/names on a CC0 league/club base); real names/photos/attributes come only from an **optional user-imported pack** for private play.
- **The build fails only at the seams** → lock the **canonical contracts** (§3 of the plan) *before* coding any subsystem.
