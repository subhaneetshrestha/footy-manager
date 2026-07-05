# PROGRESS — development state for session continuation

> Read this first in a new session, then `docs/PLAN.md` (the contracts in §3
> are LOCKED), `docs/DECISIONS.md` (D1-D7), and `docs/RESEARCH.md` as needed.
> Update this file at the end of every session and after every phase (see
> CLAUDE.md).

## Snapshot (2026-07-05)

Football-management sim, pnpm monorepo: `packages/shared` (locked contracts),
`packages/engine` (pure-TS deterministic sim), `packages/data` (world config +
seed.db pipeline + world hydrator), `apps/mobile` (Expo SDK 57 app).
Remote: github.com/subhaneetshrestha/footy-manager (CI green at `4db7831`).

## Phase status (PLAN §15 roadmap)

| Phase | Status | Notes |
|---|---|---|
| 0 — Foundations & contracts | ✅ done | Determinism gate proven on 3-OS CI matrix. Remaining externally-blocked: device threading spike (D2), StatsBomb calibration (D3), on-device seed-in-save-slot check. |
| 1 — Playable vertical slice | ✅ done | Full season vs one league (D6), tactics→λ, tables, minimal board, transfers, rollover, career UI. Remaining gate item: save/Continue needs a device (expo-sqlite unavailable on web preview, D7). |
| 2 — Coaches/staff/growth | ✅ done | Gate proven: matched elite coaching >1.5× development; budget-constrained small clubs. |
| 3 — Injuries/loans/contracts | ✅ done | Gate proven: believable injury volume (exposure model, Fuller tiers, physio effects), loan clauses + AI loans, contract lifecycle + free agency. |
| 4 — Tier-A 2D match engine | ✅ core done | `match/tierA.ts`: pre-generated deterministic event timeline (pass/carry/shot/goal/save/cards, x/y, xG, XI actors), parity with Tier B BY CONSTRUCTION (same `expectedGoalRates`; shot rate = λ/(90·meanXG·CQM)) + standing statistical parity test (±0.14 over 800 sims × 3 configs). `match/commentary.ts` deterministic templates. User fixture resolved by Tier A inside `playMatchday(world, onUserMatch?)`. App `MatchScreen`: RN-View pitch playback, score/clock, commentary ticker, live stats, pause/speed/skip. Remaining for gate: Skia renderer + 60fps check on device (D8); zone-based possession model is cosmetic-first (chance timing calibrated, not spatially emergent). |
| 5 — Youth/regens | ✅ done | Gate proven: 5-season endurance test (squads stay [18-34], active population ≥85%, plausible prospects keep arriving). `engine/youth/academy.ts` owns retirements (retired flag, GK grace year), append-only intake application, squad pruning; `data/generate/youth.ts` provides the intake generator (facilities 50% + youth coach 30% + reputation 20%); youth coach boosts U18 growth; hub shows the intake news card. Tutoring/promotion UI deferred (academy merges into senior squad as prospects). |
| 6 — Deep finance/FFP | ▶ next | |

## Verification state

- `pnpm -r test` → 164 tests green (shared 25, engine 86, data 40, mobile 13).
- `pnpm -r typecheck` → 4/4 clean.
- CI (`.github/workflows/ci.yml`): determinism matrix (ubuntu/windows/macos,
  golden battery must match `packages/engine/test/golden.json` byte-for-byte),
  data+mobile tests + seed build, typecheck. Green at HEAD.
- Golden battery regen (ONLY when sampling logic intentionally changes):
  `pnpm --filter @footy/engine golden`.
- seed.db: `pnpm build:seed` → 30 leagues / 518 clubs / ~15.5k players,
  byte-reproducible, copied to `apps/mobile/assets/db/seed.db`.

## Running the app

- Web preview: `cd apps/mobile && npx expo start --web` → http://localhost:8081.
  Career flow: New Game → league → club → hub (squad/tactics/table/transfers/
  staff, play matchday / sim season, board verdict, next season).
- Phone via Expo Go is blocked by Windows Firewall inbound on 8081 (needs one
  elevated `New-NetFirewallRule ... -LocalPort 8081`); tunnel mode blocked by
  network (ngrok). Device unlocks: save/Continue verification, threading
  spike, Skia 60fps gate.

## Key engine modules (all pure TS, deterministic — see rules in CLAUDE.md)

- `match/fastMatch.ts` Tier-B Dixon-Coles; `HOME_ADVANTAGE_GAMMA` applied here only.
- `tactics/computeProfile.ts` THE Tactics→profile emission (compat 0.8-1.2).
- `season/simulate.ts` matchday loop (heal → window AI buys+loans → fixtures +
  injury exposure → training injuries → growth tick every 4 MDs).
- `season/rollover.ts` loans resolve → contracts tick → age/value → fixtures.
- `injury/injuries.ts` single injury owner; exposure consts are calibration params.
- `transfers/{aiTransfers,loans,contracts}.ts`, `staff/hiring.ts`, `growth/growth.ts`,
  `board/board.ts`, `finance/{valuation,budgets}.ts` (single-owner formulas).
- World invariant: entity arrays 1-based contiguous (`players[i].id === i+1`).

## Known deviations / footguns

- Relative imports are EXTENSIONLESS (`./constants` not `./constants.js`) —
  Metro can't map `.js`→`.ts`. tsc/vitest/tsx all accept this.
- Root `.gitignore`: never add bare `build/`/`out/` patterns (once swallowed
  `packages/data/src/build/`).
- pnpm 10: build scripts must be allowed in `pnpm-workspace.yaml`
  `onlyBuiltDependencies`; `.npmrc` uses `node-linker=hoisted` for RN.
- `packages/data/vitest.config.ts` sets long timeouts (concurrent `pnpm -r
  test` CPU contention).
- Engine test worlds: when `WorldState`/`WorldPlayer` gain fields, update the
  `makeWorld` fixtures in `season.test.ts`, `staff-growth.test.ts`,
  `injuries-loans.test.ts` and the hydrator `data/src/world/buildWorld.ts`.

## Next session should

1. Phase 6 (PLAN §15): full revenue/expense books (gate/TV/sponsor/prize
   through finance_ledger semantics), FFP-style constraint, installments/
   agents/sell-on clauses, manager job market, global balancing pass.
2. Or the device milestone (firewall rule → Expo Go → save/Continue
   verification, threading spike D2, Skia renderer + 60fps gate D8).

## Session log

- **2026-07-05 (later still)**: Phase 5: academy/retirements/intakes/pruning +
  youth generator + intake card; 5-season endurance gate green. Endurance
  test exposed a latent Phase-3 bug (trainingInjuryPass crashed on free
  agents after a rollover — clubOf(0)); fixed with clubId-0/retired guards.
  164 tests.
- **2026-07-05 (later)**: Phase 4 core: Tier-A engine + commentary + parity
  gate + MatchScreen playback; PROGRESS.md/CLAUDE.md introduced (`677ef76`).
  158 tests. Note: `playMatchday` gained an `onUserMatch` callback; watching
  vs skipping provably yields identical world state (tested).
- **2026-07-05**: Phases 0-3 built end-to-end this session. CI stood up and
  green (determinism matrix passed 3 OSes at first attempt). Web preview used
  for manual verification throughout (phone blocked by firewall). Commits:
  `9f3b688` (P0+P1), `f4d0678` (.gitignore fix), `f34e78f` (P2), `4db7831` (P3).
