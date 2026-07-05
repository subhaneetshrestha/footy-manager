# footy-manager — Claude session guide

## What this project is

A deep, license-safe football-management sim for mobile (iOS/Android via
Expo; browser preview during development). The player manages a club —
squad, tactics, staff, transfers, finances — across an infinite career.
Core design promise: **tactics and player-system fit materially decide
matches**, and the whole simulation is **deterministic** (same seed → same
world, byte-identical across OSes).

**Start here every session: read `PROGRESS.md`** (current state, next
steps), then `docs/PLAN.md` §3 (LOCKED canonical contracts) and
`docs/DECISIONS.md` (D1+ decision log). `docs/RESEARCH.md` holds the
research grounding. Do not re-derive or re-litigate decisions recorded
there.

## Standing instruction — keep PROGRESS.md current

At the end of EVERY working session, and immediately after completing any
phase or significant milestone, update `PROGRESS.md`:
- phase table + verification state (test counts, CI status, commit hashes),
- new decisions/footguns discovered (big ones also go to `docs/DECISIONS.md`),
- a dated entry in the session log,
- an accurate "Next session should" list.
Commit it together with the work it describes.

## Repo structure

```
packages/shared/   Canonical contracts: 0-99 attribute vocabulary, positions +
                   OVR coefficient tables, play styles, TeamTacticalProfile,
                   injury tiers, constants, seedable PRNG. Everything imports
                   these; nothing redefines them.
packages/engine/   Pure-TS deterministic sim core (NO React/RN imports):
                   Tier-B match engine, tactics module, season loop, board,
                   transfers/loans/contracts, staff/hiring, growth, injuries,
                   finance (valuation/budgets), world model.
packages/data/     Dev-time world: authored config (30 leagues/518 clubs/78
                   nations/34 name banks), player+staff generators, seed.db
                   build pipeline (better-sqlite3), buildWorldForLeague
                   hydrator used by the app.
apps/mobile/       Expo SDK 57 app: zustand stores (appStore routing,
                   careerStore world session), screens (career hub, squad,
                   tactics, table, transfers, staff), DAL/save-slot model
                   (device-only), design tokens in src/ui/theme (never
                   hardcode colors/spacing — use useTheme()).
docs/              PLAN.md (execution plan), RESEARCH.md, DECISIONS.md.
```

## Tech stack

pnpm 10 workspaces · TypeScript strict · Expo SDK 57 / RN 0.86 / React 19 ·
expo-sqlite (device) · zustand · vitest · better-sqlite3 (dev-time only) ·
GitHub Actions CI (3-OS determinism matrix).

## Commands

- `pnpm -r test` / `pnpm -r typecheck` — must be green before any commit.
- `pnpm build:seed` — rebuild seed.db (byte-reproducible; copies to app assets).
- `pnpm --filter @footy/engine golden` — regenerate the determinism baseline;
  ONLY when sampling logic intentionally changes, never to "fix" CI.
- Web preview: `cd apps/mobile && npx expo start --web` → localhost:8081.
- Single package: `pnpm --filter @footy/engine test`.

## Hard rules

- **pnpm only** (user preference). Workspace deps as `workspace:*`.
- **Engine purity/determinism**: `packages/engine` + `packages/shared` have no
  React/RN imports and no `Math.random`/`Date`/libm transcendentals
  (`Math.exp`, `Math.pow`, ...) — a test greps source for violations; use
  `detExp`/`powInt` instead. All randomness flows through the injected PRNG
  (`createRng`, `deriveSeed` streams keyed by seed/season/matchday/entity).
  No unordered Map/Set iteration in engine code (membership checks are fine).
- **Single owners** (contract §3): player valuation, wages and budgets live in
  engine `finance/`; all tactics math in `tactics/computeProfile.ts`; injuries
  only in `injury/injuries.ts`; home advantage γ applied exactly once by the
  match engine. Never duplicate these formulas.
- **World invariant**: entity arrays are 1-based contiguous
  (`players[i].id === i + 1`, same for clubs/leagues/fixtures/staff);
  `assertWorldInvariants` enforces it. When `WorldState`/`WorldPlayer` gain
  fields, update the `makeWorld` fixtures in engine tests AND
  `data/src/world/buildWorld.ts`.
- **License safety**: bundled data is generated/factual only — real player
  names/photos/attributes must never ship; fictional-name alternatives exist
  for nations/leagues/clubs.
- Relative imports are **extensionless** (`./constants`, not `./constants.js`)
  — Metro cannot map `.js`→`.ts`.
- League club counts must stay **even** (round-robin fixtures).
- UI reads design tokens via `useTheme()`; no raw hex/pixel values in screens.
- Never add bare `build/` or `out/` patterns to `.gitignore` (once swallowed
  `packages/data/src/build/`).

## Testing philosophy

Every engine mechanic ships with tests in the same commit: property/
statistical tests with generous sigma bands (not flaky), golden-hash
determinism gates, and full-season integration tests asserting realism bands
(goals/match, draw share, injury volume). Test worlds are built by local
`makeWorld` helpers with fixed seeds — everything must replay byte-identically.

## Git workflow

Work directly on `main` (solo project). Commit style: imperative summary +
body explaining what/why; end with the Claude co-author trailer. Push to
`origin main` and confirm CI goes green (determinism matrix + data/mobile
jobs + typecheck). Repo-local git identity is already configured (GitHub
noreply email).

## Environment notes

- Windows dev box; phone testing via Expo Go currently blocked by Windows
  Firewall (inbound 8081) — device unlocks save/Continue verification, the
  threading spike (D2) and the Skia 60fps gate.
- pnpm 10 blocks postinstall scripts unless listed in `pnpm-workspace.yaml`
  `onlyBuiltDependencies`; `.npmrc` sets `node-linker=hoisted` for RN/Metro.
- `packages/data/vitest.config.ts` sets long timeouts — `pnpm -r test` runs
  package suites concurrently and CPU contention breaks the 5s default.
