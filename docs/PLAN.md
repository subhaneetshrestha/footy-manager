# Footy Manager — Execution Plan

> Self-contained build plan for a mobile football-management simulation. Written after a verified deep-research pass and an adversarial subsystem-design/critique pass. A developer (or a fresh AI session) should be able to execute this without any prior conversation context.

---

## 0. Context & vision

**Goal:** build *Footy Manager*, a deep, realistic football-management sim for mobile. The player manages a real-world club — squad, tactics, coaches, finances, transfers, youth — across ~30 global leagues in an open-ended (infinite) career with realistic results. **Tactics and player-system fit must materially decide matches.**

**Why the plan is shaped this way:**
1. A verified **deep-research** pass established the hard constraints — chiefly that **no free data source can legally redistribute real player photos** (and most can't redistribute real data), plus the proven techniques for stat modelling, match simulation, transfer valuation and injuries. (See `RESEARCH.md`.)
2. A **subsystem-design + adversarial-critique** pass produced detailed designs for every system, then found the seams that would break a naïve build: inconsistent attribute scales, three competing valuation formulas, a missing calendar/competition engine, double-owned board logic, a tactics model implemented twice, three incompatible save architectures, no single injury owner, and an unbudgeted compound performance spike.

This plan resolves those seams by **locking canonical contracts in Phase 0** (§3), adopts a **license-safe two-layer data model** (§4), and sequences an **MVP-first roadmap** (§15).

---

## 1. Locked decisions & scope

| Area | Decision |
|---|---|
| Platform | **Mobile-first iOS + Android** (desktop possible later via the same RN/engine core) |
| Foundation | **React Native + Expo + TypeScript**; **`@shopify/react-native-skia`** (2D pitch); **`expo-sqlite`**; **Zustand**; **Reanimated** |
| Match view | **2D top-down animated pitch + live commentary + live stats** for the user's matches; other matches simulated fast in the background |
| Data / licensing | **License-safe bundled default** + **optional user-imported real-data/photo pack** for private play |
| League scope (v1) | **~30 major global leagues, ~600 clubs, ~15–18k players**; one connected global transfer market |
| Career | **Infinite**, with **yearly regen/newgen** youth generation |
| Youth | **Full academy + intakes + training**; **coach quality drives development speed** |
| Finances | **Deep** (separate transfer + wage budgets; revenue gate/TV/sponsor/prize; FFP-style constraint) |
| Phasing | **MVP-first, then iterate** |

### Requirement → owner map (all 13 original requirements)

| # | Requirement | Owning subsystem(s) |
|---|---|---|
| 1 | ~30 leagues + players from a free DB; real avatars "if possible" | Data (§4) |
| 2 | Granular stats + position-weighted OVERALL | Player Model (§5) |
| 3 | Advanced sim: real results, transfers, loans, injuries + length | Match Engine (§6) + Injury (§3.6/§8) + Finance (§8) |
| 4 | Formation & tactics strongly drive results | Tactics (§7) → Engine (§6) |
| 5 | Play styles: counter, tiki-taka, gegenpressing, park-the-bus, + more | Tactics (§7) |
| 6 | Player-system compatibility improves results | Tactics (§7) |
| 7 | 1–10 coaches by dept + playstyle + specialists | Coaches & Staff (§8) |
| 8 | Other staff, automatable by detail level | Coaches & Staff (§8) |
| 9 | Menu New/Continue; Continue loads last save; 20 saves | App Shell + Saves (§10) |
| 10 | Choose any club; realistic budget | Finance (§8) + Data (§4) |
| 11 | Hire coaches within budget; smaller clubs get less | Coaches & Staff (§8) |
| 12 | Realistic season targets; sacking leniency by closeness | Board (§8) |
| 13 | Realistic fees/wages; young high-potential premium | Finance valuation (§8) |

---

## 2. Top-level architecture

```
footy-manager/
├─ apps/mobile/          RN + Expo app: UI, Skia pitch, navigation, Zustand stores, DAL
├─ packages/engine/      PURE TypeScript sim core — NO React/RN imports. Deterministic, seedable, unit-testable, portable.
├─ packages/data/        seed.db build scripts, data-pack importer, generators (dev-time + runtime)
├─ packages/shared/      Canonical types, attribute vocabulary, enums, constants (the "contracts")
└─ docs/                 This plan + research
```

**Principles:**
- **Engine is a pure-TS package** with zero RN dependencies → runs off the UI thread, unit-testable in Node, portable (desktop later, or Rust port). UI contains **no** simulation logic.
- **Off-thread execution** for season advance / background matches. **Phase-0 spike** decides the primitive: `react-native-worklets-core` runtime vs a headless JSI thread vs WASM.
- **Expo dev client + `expo prebuild` (EAS)** from day one — **not Expo Go** — so the Rust escape hatch and native modules stay reachable.
- **`expo-sqlite` is main-thread-only.** The engine computes off-thread and returns compact **deltas**; the DAL commits them on the main thread in **batched WAL transactions with prepared statements**, behind an "advancing…" screen.
- **Rust native module is a fallback**, not a starting assumption: build in TS, profile against the compound budget (§9/§14), port only proven hot loops if TS misses budget.

---

## 3. Canonical contracts — **LOCK IN PHASE 0 BEFORE ANY SUBSYSTEM IS CODED**

Every subsystem imports these from `packages/shared`. No subsystem may redefine them. These directly fix the seams the critique found.

1. **One attribute scale: `0–99` everywhere.** No FM 1–20, no 1–200. `OVR` (current overall) and `POT` (potential ceiling) are both `0–99`; **`POT ≥ OVR` always**. The optional FIFA importer is already 0–99; document any conversion in one place.
2. **One attribute vocabulary + one table.** A single **`player_ratings`** table (~40 cols) owned by Player Model (§5), containing everything Tactics' role-suitability math needs (technical + physical + the mental attributes + the fixed GK set). **No** parallel `player_attributes`/`player_ratings` split.
3. **One valuation function, owned by Finance (§8).** Data seeds initial `value` by **calling** it. Delete the competing formulas that appeared in the Data and Player-Model designs.
4. **One save architecture (App-Shell owned, §10):** per-slot **`save_<n>.db`** (byte-copy of shipped `seed.db`) **plus** a separate tiny **`index.db`** holding only slot metadata. **No full-world "save_blob" serialization.** One named DAL + migration-runner owner; schema-versioned migrations.
5. **Tactics → Engine is one-way.** Tactics (§7) owns *all* tactic math and emits a **`TeamTacticalProfile`** (phase strengths, expected possession share, chance-quality modifiers, compatibility multiplier). The **engine consumes it once** and never re-implements playstyle tables. **Home advantage (γ ≈ 1.08) is applied exactly once, by the engine.**
6. **One Injury owner.** A single Injury module, fed by the match engine's per-minute hazard, emits injury events; duration via **Fuller tiers** (§8). Data only *stores*; it never samples.
7. **The Calendar/Competition/Season-Rollover subsystem exists** (§9) and is a **Phase-1 prerequisite**. It owns fixtures, the `worldTick`, promotion/relegation, domestic cups, continental competitions, transfer-window state, and season rollover.
8. **Reconciled constants (in `shared`):**
   - `pace = round(0.45*acceleration + 0.55*sprint_speed)`
   - facilities scale = `1–20`
   - `roleSuitability` stored `0–1` internally (shown `0–100` in UI)
   - background matches per matchday `≈ 299` (600 clubs → ~300 matches minus the user's)
   - one fixed GK attribute set: `gk_diving, gk_handling, gk_kicking, gk_positioning, gk_reflexes`
9. **Determinism rules (engine):** integer / fixed-point math on hot paths; a **single injected seedable PRNG**; **no `Math.random`, no `Date`, no unordered `Map`/`Set` iteration** in the engine. A **CI differential test** (same seed → byte-identical across hosts) is a **hard merge gate** — protects save-continuation *and* two-engine calibration.

---

## 4. Data strategy — two layers, license-safe by default

Grounded in the licensing findings (see `RESEARCH.md`): football-data.org photos/data are non-redistributable and can't be referenced after a lapse; Wikimedia is per-file + personality/publicity rights; Kaggle FIFA ratings' redistribution is unverified.

### Layer A — bundled base (ships in the binary, always present, commercial-safe)
- **OpenFootball / football.db** (CC0 public domain) → built to SQLite via the `sportdb` Ruby gem, giving real **leagues, clubs, fixtures, tables** for ~30 leagues.
- **Generated player pool:** a **dev-time generator** creates ~15–18k players with realistic **distributions** of attributes/potential/age/nationality/value **per league tier and position** — calibrated against **StatsBomb/FBref per-90** aggregate distributions (statistical calibration, *not* copying real players → stays legally clean).
- **Generated identity:** procedural **vector avatars** (Skia-drawn from `avatar_seed`) and **procedural crests** (from club colours + `crest_style_seed`); **license-safe editable names** with a "fictional names" toggle.
- Shipped as **one `seed.db` (~8–12 MB)** Expo asset, SHA-256-verified, byte-copied to `save_<n>.db` on New Game.

### Layer B — optional user pack (never bundled, private play)
- A **validated, versioned importer** overlays a user-supplied pack **non-destructively** (base rows never overwritten; overlays resolve at read time). Example: the **Kaggle FIFA dataset** (real names, ~110 attributes, per-version **potential**), and/or user photos.
- **TheSportsDB** crests/art = optional runtime opt-in download (attribution screen; publishing needs their paid tier) into the same overlay tables — not bundled.

### Packaging & DB roles
- **`seed.db`** — read-only template, shipped as `assets/db/seed.db`. Contains the Layer-A season-0 world + static reference (nations, name banks, gen-config, competition formats, OVR coefficients).
- **`save_<n>.db`** (n = 1..20) — byte-copy of `seed.db` created lazily on New Game; grows over the career.
- New-game copy flow: `Asset.downloadAsync()` → verify SHA-256 → `FileSystem.copyAsync` → open → run migrations → stamp `index.db` row.
- PRAGMAs: build with `page_size=4096` + `VACUUM`; open saves with `journal_mode=WAL; synchronous=NORMAL; foreign_keys=ON`.
- Consider a shared read-only **`ATTACH`** DB for static reference to avoid duplicating ~40 MB of static data across 20 saves (evaluate in Phase 0/6).

### SQLite schema (canonical — reflects the locked contracts)

```sql
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
-- rows: schema_version, content_version, seed_build_id, master_seed, created_at

CREATE TABLE nations(
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, name_fictional TEXT,
  confederation TEXT, reputation INTEGER, name_bank_id INTEGER);

CREATE TABLE leagues(
  id INTEGER PRIMARY KEY, name TEXT, name_fictional TEXT, real_key TEXT, -- 'eng.1'
  nation_id INTEGER, tier INTEGER, reputation INTEGER,      -- 0-100
  num_clubs INTEGER, promotion_slots INTEGER, relegation_slots INTEGER,
  foreign_player_cap INTEGER, tv_pool_base INTEGER, prize_pool_base INTEGER,
  avg_attendance_base INTEGER);

CREATE TABLE clubs(
  id INTEGER PRIMARY KEY, league_id INTEGER, real_key TEXT,
  name TEXT, name_fictional TEXT, short_name TEXT, nation_id INTEGER, city TEXT,
  reputation INTEGER,                       -- 0-100 → budgets, squad quality, targets
  stadium_name TEXT, stadium_capacity INTEGER,
  color_primary TEXT, color_secondary TEXT, crest_style_seed INTEGER,
  balance INTEGER, budget_transfer INTEGER, budget_wage INTEGER,
  training_facilities INTEGER, youth_facilities INTEGER,   -- 1-20
  is_generated INTEGER DEFAULT 1);

CREATE TABLE players(
  id INTEGER PRIMARY KEY, club_id INTEGER,   -- NULL = free agent
  first_name TEXT, last_name TEXT, known_as TEXT,
  nation_id INTEGER, second_nation_id INTEGER, dob TEXT,
  primary_position TEXT, secondary_positions TEXT,   -- CSV of pos codes
  height_cm INTEGER, weight_kg INTEGER, preferred_foot TEXT,
  ovr INTEGER, potential INTEGER,            -- 0-99 (cached; POT>=OVR)
  value INTEGER, wage INTEGER, reputation INTEGER,
  morale INTEGER, form REAL, fitness INTEGER, squad_status TEXT,
  avatar_seed INTEGER,
  is_generated INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1,
  real_key TEXT, generation_batch INTEGER);  -- batch = season regen id

-- SINGLE canonical ratings table (contract §3.2). All 0-99.
CREATE TABLE player_ratings(
  player_id INTEGER PRIMARY KEY,
  -- physical
  acceleration INTEGER, sprint_speed INTEGER, agility INTEGER, balance INTEGER,
  jumping INTEGER, stamina INTEGER, strength INTEGER, reactions INTEGER,
  -- technical
  finishing INTEGER, shot_power INTEGER, long_shots INTEGER, volleys INTEGER,
  short_passing INTEGER, long_passing INTEGER, crossing INTEGER,
  dribbling INTEGER, ball_control INTEGER, first_touch INTEGER,
  technique INTEGER, fk_accuracy INTEGER, heading INTEGER,
  -- defending
  marking INTEGER, standing_tackle INTEGER, sliding_tackle INTEGER, interceptions INTEGER,
  -- mental (needed by Tactics' role-suitability math)
  positioning INTEGER, vision INTEGER, composure INTEGER, work_rate INTEGER,
  aggression INTEGER, decisions INTEGER, anticipation INTEGER,
  concentration INTEGER, off_the_ball INTEGER, bravery INTEGER,
  -- goalkeeping (fixed set)
  gk_diving INTEGER, gk_handling INTEGER, gk_kicking INTEGER,
  gk_positioning INTEGER, gk_reflexes INTEGER,
  -- hidden / growth
  injury_proneness INTEGER, consistency INTEGER, potential_ability INTEGER);
  -- (potential_ability == players.potential, kept here for engine locality)

CREATE TABLE staff(
  id INTEGER PRIMARY KEY, club_id INTEGER, first_name TEXT, last_name TEXT,
  role TEXT,                                 -- manager|gk_coach|def_coach|mid_coach|att_coach|set_piece|fitness|physio|analyst|scout|youth
  rating_gk INTEGER, rating_def INTEGER, rating_mid INTEGER, rating_att INTEGER,   -- 1-10
  playstyle_ratings TEXT,                    -- JSON: {"gegenpressing":10,"tiki_taka":6,...} 1-10
  wage INTEGER, contract_until TEXT);

CREATE TABLE contracts(
  id INTEGER PRIMARY KEY, player_id INTEGER, club_id INTEGER,
  wage INTEGER, start_date TEXT, end_date TEXT,
  signing_bonus INTEGER, loyalty_bonus INTEGER, appearance_bonus INTEGER, goal_bonus INTEGER,
  release_clause INTEGER, squad_role TEXT);

CREATE TABLE loans(
  id INTEGER PRIMARY KEY, player_id INTEGER, owner_club_id INTEGER, loan_club_id INTEGER,
  wage_split REAL, start_date TEXT, end_date TEXT,
  option_to_buy INTEGER, obligation_to_buy INTEGER, buy_fee INTEGER,
  recall_allowed INTEGER, min_minutes_promise INTEGER);

CREATE TABLE competitions(
  id INTEGER PRIMARY KEY, name TEXT, type TEXT,   -- league|domestic_cup|continental
  scope TEXT, format TEXT, tv_pool INTEGER, prize_schedule TEXT);

CREATE TABLE fixtures(
  id INTEGER PRIMARY KEY, competition_id INTEGER, season INTEGER, round INTEGER,
  match_date TEXT, home_club_id INTEGER, away_club_id INTEGER,
  home_goals INTEGER, away_goals INTEGER, played INTEGER DEFAULT 0,
  is_user_match INTEGER DEFAULT 0);

CREATE TABLE injuries(
  id INTEGER PRIMARY KEY, player_id INTEGER, start_date TEXT, end_date TEXT,
  tier TEXT, type TEXT, days INTEGER);         -- tier: minimal|mild|moderate|severe|career_ending

CREATE TABLE transfers(
  id INTEGER PRIMARY KEY, player_id INTEGER, from_club_id INTEGER, to_club_id INTEGER,
  fee INTEGER, date TEXT, window TEXT);

CREATE TABLE finance_ledger(
  id INTEGER PRIMARY KEY, club_id INTEGER, date TEXT, category TEXT, amount INTEGER, note TEXT);

CREATE TABLE board_state(
  club_id INTEGER PRIMARY KEY, season INTEGER, target TEXT,
  confidence INTEGER, patience INTEGER, expectation_json TEXT);

-- index.db (separate file): one row per slot, metadata only.
CREATE TABLE save_index(
  slot INTEGER PRIMARY KEY, save_name TEXT, club_name TEXT, manager_name TEXT,
  in_game_date TEXT, season INTEGER, last_played_at INTEGER,
  app_version TEXT, schema_version INTEGER, content_version TEXT,
  file_bytes INTEGER, avatar_seed INTEGER);
```

---

## 5. Player model (owns `player_ratings`, OVR, potential, growth, regens)

- **Attributes (`0–99`):** as in the `player_ratings` DDL above. `pace` is **derived** (`0.45*accel + 0.55*sprint_speed`) — not stored.
- **Overall (OVR):** position-weighted linear combination:
  `OVR = round( Σ_attr coeff[pos][attr] × attr )`, with per-position coefficient tables (in `shared`) whose weights sum to 1. Approximates FIFA's "positional coefficients." **Calibration task:** tune coefficients so OVR reproduces known reference overalls (validate against the Kaggle set at dev time).
- **Potential & growth:** `POT` is a hidden 0–99 ceiling (surfaced to the user only as a **star range**). Growth follows an **age curve** (rise to peak ~24–29, decline after) modulated by **minutes played, coaching quality & style-match, training, facilities, morale** → this is where Coaches (§8) plug in. Growth per tick moves current attributes toward the potential-implied ceiling at a rate scaled by these factors.
- **Regens (yearly, at season rollover):** generate newgen intakes with nationality/position distributions matching the world, **license-safe per-nation name pools**, and attribute+potential sampling scaled by club/nation reputation → world never empties across an infinite career.
- Also owns: `form`, `condition/fitness`, `morale`, `squad_status`, and hidden `injury_proneness`, `consistency`.

---

## 6. Match simulation engine — **tiered** (tactics must decide matches)

### Tier A — detailed engine (the user's matches)
- **Zone-based, minute-by-minute possession model** (Markov-inspired transitions across pitch zones with/without defensive pressure; **xG-based shot resolution**), fully **deterministic** via the injected PRNG.
- Emits a **timestamped event stream**: `{minute, type, actorId, x, y, targetId?, xg?}` where type ∈ pass | carry | tackle | shot | goal | card | injury | sub | corner | freekick.
- **Pre-generate the whole deterministic timeline, then play it back** on the Skia pitch — so sim and render never compete for the frame. The 2D renderer, commentary selector and live-stats reducer all consume this one stream. Only changed sprites redraw.

### Tier B — fast engine (the ~299 other matches each matchday)
- **Bivariate Poisson with Dixon–Coles** low-score correction:
  - `λ_home = attack_home × defence_away × γ × styleMod_home × compat_home`
  - `λ_away = attack_away × defence_home × styleMod_away × compat_away`
  - sample goals from bivariate Poisson(`λ_home, λ_away, λ_cov`), apply Dixon–Coles `τ` correction for 0–0/1–0/0–1/1–1.
- `attack`/`defence` derive from **squad OVR weighted by position** × the Tactics `TeamTacticalProfile`. Calibrate to realistic score/goal distributions.

### Shared inputs (both tiers)
- The **`TeamTacticalProfile`** and the **compatibility multiplier** from Tactics (§7) scale expected goals / possession / chance quality — **the mechanism that makes tactics and player-fit matter a lot.**
- **Home advantage (γ ≈ 1.08) applied once, by the engine** (contract §3.5).
- In-match: fatigue, momentum, cards, substitutions, and the **per-minute injury hazard** handed to the Injury module (§8).

### Parity
- Tier A and Tier B must **agree in expectation** for the same teams → a **standing CI calibration gate** (not a one-time check).

---

## 7. Tactics, formations, play styles & compatibility (owns all tactic math)

### Play styles as parameter bundles
Each style is a set of engine parameters. Example (values illustrative, `0–100` unless noted; tune during calibration):

| Style | tempo | line height | press intensity | width | directness | build-up | marking | compactness |
|---|---|---|---|---|---|---|---|---|
| Tiki-taka / possession | 45 | 60 | 55 | 70 | 20 | short | zonal | 55 |
| Gegenpressing | 75 | 75 | 90 | 60 | 45 | short/mixed | high zonal | 70 |
| Counter-attack | 80 | 40 | 40 | 55 | 80 | direct | zonal | 65 |
| Park-the-bus / low block | 30 | 25 | 25 | 40 | 60 | clear | man+zonal | 85 |
| High press | 70 | 70 | 85 | 65 | 50 | mixed | high | 65 |
| Wing play | 65 | 55 | 55 | 85 | 60 | wide | zonal | 50 |
| Direct / long-ball | 70 | 45 | 45 | 60 | 90 | long | zonal | 60 |
| Balanced | 55 | 55 | 55 | 60 | 50 | mixed | zonal | 55 |
| Tempo control | 40 | 55 | 50 | 60 | 30 | short | zonal | 60 |

(Room to add more; these map into `λ`/possession/chance-quality modifiers in the engine.)

### Formations & roles
- Formations = position slots + roles/duties. **MVP trims to ~4–6 formations, the required play styles, and a reduced role set** (full catalogue of 16 formations / 12 styles / 24–34 roles is deferred to a later phase).

### Player-system compatibility (req #6)
- **Per-role suitability** from a player's attributes (`0–1` internally): each role has weighted attribute requirements; suitability = weighted match.
- **Team cohesion/familiarity** builds with time/training; drops after big lineup/formation/style changes.
- These combine into a **bounded compatibility multiplier**: `M = M_role × M_familiarity × M_cohesion`, ≈ `[0.80, 1.20]`, applied by the engine to effective performance. **Suited players in a suited system → materially better results; misfits punished.**
- Tactics emits the `TeamTacticalProfile` the engine consumes (contract §3.5). Mobile UX: strong presets + sensible defaults; opposition instructions optional.

---

## 8. Coaches, staff, finances, transfers, board & targets

### Coaches & staff (feeds growth, injuries, set-pieces, match prep)
- **Coach model:** each coach has a **1–10 rating per department (GK, defense, midfield, attack)** *and* a **per-play-style specialization rating** (`playstyle_ratings` JSON, e.g. "10 for gegenpressing, 6 for tiki-taka"). Higher rating + style-match → faster player growth, better match prep, better set-piece/defensive routines.
- **Specialists:** set-piece coach, fitness/S&C, physio (injury prevention & recovery speed), analysts, scouts, youth coaches.
- **Budget-scaled hiring (req #11):** coaching/staff budget derived from club reputation/size → smaller clubs afford fewer/worse coaches. Hire/fire within budget.
- **Auto-management toggle (req #8):** a depth slider — the game can auto-fill/auto-hire staff for players who want less micromanagement.

### Finances (deep) — owns the single valuation function
- **Model:** separate **transfer** & **wage** budgets; revenue = gate + TV/broadcast + sponsorship + prize money + player sales; expenses = wages + transfers + facilities; club balance; **FFP-style constraint** (deferred to Phase 6 but designed in).
- **Realistic starting budgets** scale with club **reputation** and league TV/prize pools.
- **Player valuation — single owner (req #13):**
  ```
  Value = BASE(OVR) × f_age(age) × f_pot(POT,OVR,age) × f_contract(years_left)
                    × f_reputation × f_position × market_inflation

  BASE(OVR)      ≈ 10_000 × 1.18^(OVR − 40)                 // € exponential in current overall
  f_age(age)     = inverted-U peaking ~27 (youth uplift, decline after ~30)
  f_pot(...)     = 1 + k_pot × (POT − OVR) × youthFactor(age)
                   youthFactor high for age ≤ 21, decaying to ~0 by age ~29
  f_contract     = scales down as contract runs out (0 yrs → near-free)
  ```
  So a 17-yo with OVR 68 / POT 90 commands a **large** fee despite low current ability. (Grounded in McHale & Holmes' ML-over-regression result + the StatsBomb inverted-U age–value curve; see `RESEARCH.md`.) Constants are tuned during calibration.
- **Contracts:** wage, length, signing/loyalty/appearance/goal bonuses, release clauses. **Loans:** wage-contribution split, option/obligation to buy, recall clause, playing-time promise. **AI clubs** buy/sell/loan to squad needs within budget.

### Board, season targets & job security (req #12) — single owner
- **Season targets by club reputation:** elite (e.g. Man City) → win everything; big club → title challenge/trophy; mid-table → upper half; small → survival.
- **Job security with leniency:** sacking probability rises only when results fall **beyond a tolerance band** around the target trajectory, scaled by board patience/reputation. **The closer to target, the more lenient.** e.g. `sackP = clamp((gap − tolerance)/sackScale, 0, 1) × patienceMod` — where a small `gap` ⇒ `sackP = 0`.
- A **minimal board ships in Phase 1** (it's an MVP acceptance criterion).
- **Manager reputation/profile** persists across clubs and drives job offers.

---

## 9. Calendar / competition / season-rollover subsystem

The owner the critique found missing. **Phase-1 prerequisite.** Owns:
- **Fixture generation** for all competitions.
- The **`worldTick`** that advances the world clock.
- **Promotion/relegation** processing.
- **Domestic cups** and **cross-league continental competitions** (whose TV/prize pools Finance references).
- **Transfer-window state** (open/closed).
- **Season rollover:** trigger regens, contract expiries, budget resets, target re-issue.

Everything else consumes it.

---

## 10. App shell, navigation & save system

- **Screen map:** Main menu (**New Game** + **Continue** → loads most-recent save) → **20-slot save/load** (metadata cards read only from `index.db`) → club-selection browser (shows **realistic budgets**) → in-career screens: home/inbox, squad, tactics, **match-day 2D**, transfers/search, staff, finances, youth/academy, league tables, calendar/schedule, player profile.
- **Continue** = open the save with max `last_played_at` from `index.db`.
- **Save system (contract §3.4):** per-slot `save_<n>.db` + separate `index.db`; **autosave + manual**; schema-versioned migrations run on open. In-memory state as **SoA typed arrays** hydrated via raw `getAllAsync` (not ORM row objects) to hit a **<3s** load budget; **dirty-delta** persistence.
- **State:** Zustand stores backed by the DAL; **the DAL is the only thing that touches SQLite.**

---

## 11. Performance strategy (the compound-spike fix)

- **Compound worst-case budget:** explicitly model the day when a matchday commit + monthly growth tick (18k players) + open-window transfer AI (600 clubs) + (season boundary) regen (~16k rows) coincide.
- **Global tick scheduler:** serialize/spread growth, AI and regen across ticks; never run them in the same frame window as a matchday commit; all behind an "advancing…" progress screen.
- **DB:** WAL, `synchronous=NORMAL`, prepared statements, chunked batched transactions; measure ArrayBuffer marshalling cost off-thread→main.
- **Render:** timeline-playback (not live sim during render); redraw only changed Skia sprites.
- **Storage:** storage meter + `VACUUM` + finance-ledger archival; evaluate shared read-only `ATTACH` DB to avoid duplicating ~40 MB static data across 20 saves.

---

## 12. (reserved)

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Legal** — real names/photos/attributes not shippable | License-safe Layer A default; real data only via private user pack; fictional-name toggle; attribution flow for any opt-in art |
| **Compound performance spike** on mobile | Global tick scheduler, off-thread engine, batched WAL commits, timeline playback; profile against summed worst case; Rust escape hatch reserved |
| **Determinism drift** (Hermes floats / TS↔worklet↔Rust) | Integer/fixed-point hot paths, single injected PRNG, forbidden-API lint, CI byte-identical differential gate |
| **Sim realism / calibration** | Two-engine parity gate; per-90 distribution calibration in Phase 0; OVR-coefficient calibration against reference overalls |
| **Scope creep** | MVP trim (formations/styles/roles); defer FFP/agents/installments/manager-market; contracts locked before coding |

## 14. Verification (prove each phase works end-to-end)

- **Engine (Node):** unit + property tests; the **CI differential determinism test** (same seed → identical output) as a merge gate; season-simulation statistical tests (goal/score/table distributions within realistic bounds; two-engine parity).
- **Data:** validate `seed.db` builds (~30 leagues / ~600 clubs / ~15–18k players); generated attribute distributions vs calibration targets; pack-importer round-trip tests.
- **App (device):** drive the real flow on an iOS/Android **dev client** — New Game → pick club → sim a season → transfers → board verdict → save → Continue restores state; measure load (<3s hydrate) and matchday advance against the perf budget; Phase 4 adds 60fps pitch-playback checks.

---

## 15. Roadmap — MVP-first (with tasks + acceptance gates)

### Phase 0 — Foundations & contracts (de-risk first)
**Tasks:** Lock all canonical contracts (§3) in `packages/shared`. Scaffold monorepo + **Expo dev client / `expo prebuild` / EAS**. Build the `seed.db` pipeline (OpenFootball import + generator). Run a **first StatsBomb/FBref per-90 calibration pass** for generated-player distributions. Stand up DAL + migrations + save/`index.db` model + **determinism CI gate**. Run the **off-thread threading spike** and pick the primitive. Decide the `ATTACH`-vs-duplicate static-data question.
**Gate:** a seeded `seed.db` (~30 leagues) opens in a save slot; a trivial deterministic engine run is byte-identical in CI across hosts.

### Phase 1 — Playable vertical slice (the MVP)
**Tasks:** Player model + OVR (§5); **Calendar/competition engine** (§9); **Tier-B fast match engine** (§6); New Game → pick club (realistic budget) → view squad → pick a formation/play style (from the MVP-trimmed set) → **simulate a full season** with realistic tables/results → **basic transfers** → **minimal board target hit/miss + sacking verdict** → save/Continue.
**Gate:** you can play a believable full season end-to-end on a phone; tables look realistic; the board reacts to your finish; Continue restores state.

### Phase 2 — Coaches, staff & training + player growth
**Tasks:** Coach 1–10 model + playstyle specialization, specialists, budget-scaled hiring, auto-manage toggle; growth/decline driven by coaching + minutes + facilities + morale.
**Gate:** better/style-matched coaches measurably accelerate development; small clubs are visibly constrained.

### Phase 3 — Injuries + loans + contract depth
**Tasks:** Injury module (per-minute hazard → **Fuller-tier** durations), loans (all clauses), richer contracts/negotiation, AI market realism.
**Gate:** injuries occur at believable rates/lengths; the loan/transfer market behaves plausibly across a season.

### Phase 4 — Tier-A 2D match engine + commentary
**Tasks:** deterministic timeline, Skia pitch playback, commentary, live stats; two-engine parity CI gate.
**Gate:** the user's matches render smoothly at 60fps; Tier A and Tier B agree in expectation.

### Phase 5 — Youth academy + full development + yearly regens
**Tasks:** academy, intakes, tutoring, promotion; regen generation at season rollover.
**Gate:** a 5+ season save stays populated and produces plausible youth prospects.

### Phase 6 — Deep finances / FFP + polish & balancing
**Tasks:** full revenue/expense books, FFP, installments/agents/sell-on, manager job market; global balancing pass; optional real-data-pack importer UI + TheSportsDB opt-in.
**Gate:** multi-season economy is stable; a 10+ season career is balanced and fun.

---

## 16. Open questions to resolve during Phase 0 (from the research/critique)

- How many of the ~30 leagues are **fully match-simmed** in background vs statistically abstracted, to protect battery/perf?
- Which **threading primitive** wins the Phase-0 spike (worklets-core / headless JSI / WASM)?
- Exact **OVR coefficient** tables (calibrate against reference overalls).
- Injury **incidence/frequency** rates (research covered *duration* well; frequency is under-evidenced → parameterize + calibrate).
- Confirm OpenFootball's exact **player-level coverage** (a "no player profiles" claim was refuted in research; the generator fills any gap regardless).

## 17. Handoff notes (for a fresh Fable session)

1. Read this file and `docs/RESEARCH.md`.
2. Do **not** skip Phase 0 — the canonical contracts (§3) and the determinism gate must exist before any subsystem is written, or the seams reappear.
3. Keep the **engine pure TS** and **UI logic-free**; the DAL is the only SQLite toucher.
4. Keep the bundled game **license-safe**; real data is opt-in only.
5. Each phase has an **acceptance gate** — don't advance until it's met and verified on a device/dev-client.
