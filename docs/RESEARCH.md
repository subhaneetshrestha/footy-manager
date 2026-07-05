# Footy Manager — Research Findings

> Verified, adversarially-checked research (fan-out web search → source fetch → 3-vote verification → synthesis). 27 sources fetched, 116 claims extracted, 25 verified (24 confirmed / 1 refuted). These findings ground the decisions in `PLAN.md`. Confidence and sources are noted per finding.

## Headline conclusion

**No free or community data source can legally supply real player headshots for a shippable app.** StatsBomb Open Data has no images; football-data.org's photos/logos are copyrighted and non-redistributable (and can't even be referenced after a subscription lapses); Wikimedia Commons photos carry per-file licenses *plus* independent personality/publicity rights that block commercial use of a person's likeness. → The bundled game must be **license-safe** (generated players/avatars/names on a CC0 league/club base); real names/photos/attributes come only via an **optional, user-imported private pack**.

---

## 1. Data sourcing & licensing

- **Real player headshots — the hard blocker (high confidence).** football-data.org Terms 9.2: "All graphics, including team logos and profile photos, are copyrighted by their legal owner." Wikimedia Commons is licensed **per-file** (no blanket license), with no warranty, and "commercial use of images of people may require the explicit agreement of the subject." Personality/publicity rights are a legal category distinct from copyright (WIPO Sports Image Rights). **Sourcing real headshots for a commercial app requires per-player licensing, not bulk harvesting.**
  - Sources: football-data.org, Wikimedia Commons "Reusing content" & "Licensing".

- **OpenFootball / football.db — the clean shippable base (high).** Schema, data and scripts are dedicated to the **public domain (CC0): "Use as you please with no restrictions whatsoever."** Fully redistributable and commercial-OK. Builds into a **SQLite** database via the **`sportdb` Ruby gem** (`sportdb create` → empty schema, then load). Fixtures/results/tables-centric (leagues, clubs, schedules, scores). Player-level coverage is unresolved — a "no player profiles" claim was **refuted (1-2)** — so treat it as the license-safe backbone for leagues/clubs/fixtures; the generator fills player data.
  - Sources: openfootball.github.io, openfootball build-shell docs, github.com/sportdb/sport.db.ruby.

- **Kaggle "FIFA 23 Complete Player Dataset" (stefanoleone992) — best real-data pack source (high).** 19,000+ players, ~110 attributes each, **FIFA 15–23** (9 versions) with per-version **overall AND potential** ratings → directly enables growth modelling. **BUT** the redistribution license of the scraped ratings is **unverified** → use **only as an optional user-imported pack, never bundled**. "Complete" = all EA-rated players, not all real-world leagues.
  - Source: kaggle.com/datasets/stefanoleone992/fifa-23-complete-player-dataset.

- **StatsBomb Open Data — event data, not attributes, not images (high).** Free granular JSON (`competitions.json`, `matches/{comp}/{season}.json`, `events/{match}.json`, `lineups`, `three-sixty`). **No images.** Covers only "certain leagues" released for **research/analytics**; commercial shipped-game use is doubtful. Use only as a **dev-time pipeline** to derive statistical attribute distributions (not shipped real data).
  - Source: github.com/statsbomb/open-data.

- **TheSportsDB — one of few free sources with imagery (high).** Free JSON API bundles **crowd-sourced artwork/logos**; requires **attribution**; **app-store publishing needs a paid tier (~$9/mo V2)**. Candidate for club crests/some imagery *with attribution* — as an optional runtime opt-in, not bundled.
  - Source: thesportsdb.com/free_sports_api.

- **football-data.org — unusable for a shipped offline game (high).** Beyond copyrighted photos/logos, **after a subscription is cancelled the customer may not reference the obtained data** (fixtures, results, tables, squads, top scorers) in their product — so it can't be permanently embedded. Also mandates a visible attribution string.
  - Sources: football-data.org Terms + FAQ.

---

## 2. Deriving attributes & the overall rating

- **Overall = position-weighted linear combination (medium).** FIFA/EA computes OVR via per-position **"Positional Coefficients"** multiplied and summed — **not a flat average**. Football Manager uses **Current Ability (CA, 1–200) = weighted sum of attributes**, capped by **Potential Ability (PA)**. Exact official coefficients are not public → build a **configurable position-coefficient model** and calibrate it to reproduce known overalls. *(Plan normalizes everything to a single 0–99 scale.)*
  - Sources: Goal.com "FIFA ratings explained", FMScout "Current Ability" guide.

- **Per-90 normalization for deriving attributes from events (high).** StatsBomb/FBref radar metrics are all computed **per-90-minutes** to compare players with different playing time — the practical basis for mapping real event data → pace/passing/finishing/defending attributes.
  - Source: StatsBomb "Understanding StatsBomb Radars".

---

## 3. Match simulation engine

- **Possession-chain Markov model (high).** Model a possession as a Markov chain with **two absorbing states (Goal, Turnover)** + ~84 transient states (76 geographic zones = 38 locations × with/without pressure, + 8 set-piece contexts). **Memoryless property** (next transition depends only on current state). A player action's attacking contribution = **ΔP(goal) = Pr(Goal | state t+1) − Pr(Goal | state t)** (basis of xThreat/VAEP). This is a valuation/possession model; extend it into a 90-minute simulator (Plan's Tier A).
  - Source: StatsBomb "Attacking Contributions: Markov Models for Football".

- **Fast result-level models (established).** Bivariate Poisson / **Dixon–Coles** (low-score correction), **Elo**/team-strength, and **xG-based** simulation are standard for fast result generation (Plan's Tier B). *(Named in the brief; standard practice; the verification pass surfaced the Markov model + the two open-source engines rather than a specific Poisson claim.)*
  - Sources: dashee87 "Dixon-Coles and time-weighting", statsandsnakeoil "Dixon-Coles and xG".

- **Two live open-source references (high).** **ZOXEXIVO/open-football** — pure-Rust engine, "matches are resolved by the engine, not by user input." **OpenFootManager** — zone-based, **minute-by-minute** sim with discrete event types, a **PlayStyle enum** (Balanced/Attacking/Defensive/Possession/Counter/HighPress), configurable pressing/line/build-up/marking/tempo, and a **home-advantage multiplier (~1.08)**. (Their marketing "22 event types" is stale; actual enum ~31–32.)
  - Sources: github.com/ZOXEXIVO/open-football, openfootmanager.com, github.com/openfootmanager/openfootmanager.

---

## 4. Tech stack & architecture reference

- **Best-evidenced reference stack (high).** **OpenFootManager** is a working open-source manager: **Rust** match-sim engine + game state, **React + TypeScript + Tailwind** UI, **Tauri v2** desktop shell ("smaller and faster than Electron"), **embedded SQLite** (`rusqlite { features=['bundled'] }`) for fully-offline saves. It uses **multiple save slots** and stores **save metadata separately from full save data** so the load screen doesn't deserialize whole saves. (GitHub language split ~Rust 53% / TS 46%.)
  - Sources: openfootmanager.com, github.com/openfootmanager/openfootmanager.
  - **Plan's adaptation:** we're mobile-first RN + Expo + Skia + `expo-sqlite`, so we keep the *architecture pattern* (pure engine core + UI + embedded SQLite + separate save metadata index) and keep Rust as an optional native-module fallback rather than the primary engine.

- **Save-system best practice (high).** Store save metadata (name, playtime, date, thumbnail) **separately** from the full save so the slot screen renders without deserializing full saves.

---

## 5. Transfer economics & injuries

- **Transfer fees → ML over performance metrics (high).** McHale & Holmes, *EJOR* 306(1) 2023: tree-boosting (XGBoost — xgbTree/xgbDART) predicts fees **considerably more accurately than linear regression**, and advanced performance metrics improve predictions further. Age–value follows an **inverted-U curve**; young attackers command a **premium** reflecting potential + remaining career length. → fee = f(current ability, **potential**, age curve, position, contract length, reputation, form, inflation); the young-potential premium is a design term atop this.
  - Sources: sciencedirect.com S0377221722005082 (McHale & Holmes 2023), StatsBomb "Age and Value in the Transfer Market".

- **Injury durations → Fuller consensus tiers (high).** Day-loss buckets: **minimal (1–3 days), mild (4–7), moderate (8–28), severe (>28)** — plus slight (0) and career-ending. Observed frequencies roughly balanced (counts 1,235 / 1,930 / 1,773 / 1,205 in a 6,143-injury dataset) → sampling weights. **Injury incidence/frequency is under-evidenced** → parameterize by position/age/minutes/injury-proneness and calibrate.
  - Sources: PMC11925455, PMC2491990 (Fuller et al. 2006 consensus).

---

## Caveats & open questions

- Real, redistributable player photos are **effectively unavailable** from free sources; personality/publicity rights are jurisdiction-dependent → get legal counsel before shipping any real likeness.
- Kaggle FIFA ratings' own redistribution license was **not verified**; StatsBomb use in a commercial game looks **doubtful** (research/analytics framing).
- Exact **FIFA/FM overall formulas** and Poisson/Dixon-Coles/Elo specifics weren't confirmed by surviving primary claims → treat OVR coefficients and fast-engine parameters as **calibration targets**, not givens.
- Injury **frequency** (vs duration) and quantitative **formation/tactic/compatibility effect sizes** are under-evidenced → calibrate in-engine.
- OpenFootball's exact **player-level coverage** is unresolved (the "no player profiles" claim was refuted) → the generator makes this moot for the bundled build.

## Source index

Data/licensing: statsbomb/open-data · football-data.org (+FAQ) · Wikimedia Commons (Reusing content, Licensing) · kaggle stefanoleone992 FIFA · openfootball.github.io (+build-shell) · sportdb/sport.db.ruby · thesportsdb.com/free_sports_api
Ratings: goal.com FIFA ratings · fmscout current-ability · statsbomb radars · fbref radar tutorial
Match engine: dashee87 Dixon-Coles · statsandsnakeoil Dixon-Coles+xG · ZOXEXIVO/open-football · openfootmanager.com (+GitHub) · statsbomb Markov models
Tech: openfootmanager GitHub · infoworld Electron-vs-Tauri · dolthub Electron-vs-Tauri · Tauri2+SQLite guide · save-systems guide · openfootball build-shell
Transfers/injuries: statsbomb age-and-value · sciencedirect McHale & Holmes 2023 · footballgpt FM finances · PMC11925455 · PMC2491990
