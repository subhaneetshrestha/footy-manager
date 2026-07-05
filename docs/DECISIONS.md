# Engineering decisions log

## Phase 0 closure (2026-07-05)

**D1 — Static data: duplicate per save, no shared ATTACH DB (PLAN §4/§16).**
The built seed.db is 4.3 MB total; static reference (nations, name banks,
gen_config) is well under 2 MB of that. Worst case with all 20 slots used is
~86 MB — acceptable on modern phones and far below the ~40 MB-per-save static
payload the plan worried about. A shared read-only ATTACH adds cross-file
transaction and migration complexity for negligible savings at this size.
Revisit only if seed.db exceeds ~20 MB.

**D2 — Off-thread threading spike: deferred to the first device milestone.**
The spike (worklets-core vs headless JSI vs WASM) requires a physical
device/dev-client build, which this environment cannot produce. The engine is
already pure TS with zero RN imports, so nothing built so far constrains the
choice. Blocking marker: run the spike before wiring season-advance into the
mobile UI on device.

**D3 — Per-90 calibration: parameterized, first pass pending datasets.**
Generator distributions and engine constants (BASE_LAMBDA, K_OVR, ρ) are
centralized and covered by statistical tests with realistic bands (score
distributions, tier ordering, draw share). The StatsBomb/FBref calibration
pass will tune these constants; it does not change any interface.

**D4 — Cross-host determinism: proven locally, CI matrix pending remote.**
The golden battery passes on Windows; the 3-OS GitHub Actions matrix exists
but requires the repository to be pushed (blocked on the user's GitHub SSH
key registration).

**D5 — OpenFootball import replaced by authored config (PLAN §4 deviation).**
League/club base data was authored directly as TypeScript config (facts:
names, cities, stadiums, capacities — not copyrightable) instead of importing
OpenFootball via the sportdb Ruby toolchain. Equivalent license posture, no
Ruby dependency, and the config doubles as the validation fixture.

## Phase 1 scope decisions (2026-07-05)

**D6 — Vertical slice simulates the user's league only.**
The MVP season loop runs the chosen league end-to-end (fixtures, results,
table, board). The other 29 leagues stay dormant in this slice; the global
transfer market and background-league simulation land with the calendar
extension in later Phase-1 iterations. Rationale: full-world generation is
15-25 s of UI-thread work in the browser preview, and the off-thread
primitive (D2) is not chosen yet.

**D7 — Web preview hydrates the world from bundled config + generator.**
expo-sqlite/FileSystem are unavailable in the browser preview, so the career
world is built in-memory (deterministic seed → identical world to seed.db).
On device, the same WorldState will hydrate from save_<n>.db via the DAL —
the engine only ever sees WorldState either way.

## Phase 4-6 decisions (2026-07-05)

**D8 — Match playback renders with RN Views until the device milestone.**
The Tier-A timeline plays back on an RN-View pitch (works in the web
preview); the Skia renderer and the 60fps gate land with the device
milestone. The timeline/playback split means only the renderer swaps.

**D9 — Optional real-data pack importer + TheSportsDB opt-in deferred.**
Both need interactive network/licensing UI and are private-play features
(PLAN §4 Layer B); they slot in after the device milestone without touching
engine contracts.

**D10 — FFP embargo blocks fee transfers, not free-agent registrations.**
Matches real-world embargo behavior and prevents embargoed clubs' squads
from starving (found by the 10-season stability gate).
