# Big Botter — Implementation Plan

> **For the executing agent:** This file is self-contained. Read it top to bottom before writing code.
> The companion file `SPEC.md` (same directory) is the full product spec — read it too for product
> detail, the exact data model (§14), and BB-US rules (§5). When `SPEC.md` and this plan agree, follow
> this plan's concrete structure; when you need product nuance, defer to `SPEC.md`. **Do not start Milestone 2
> until Milestone 1's done-gate (tests green + a clean console season) is met.**

---

## 1. What we're building

**Big Botter** is a multi-agent simulation of *Big Brother US*. 16 AI houseguests (powered by Claude Haiku)
play a full, rules-accurate season — HOH competitions, nominations, vetoes, evictions, alliances, lies,
showmances, confessionals, a jury — and the user watches it back as a polished broadcast-style replay.

**The cardinal rule of this build (SPEC §17):** build the **deterministic engine first, with ZERO API calls.**
A full, rules-correct season must run end-to-end in the console using *random placeholder agents* before a
single token is spent on Haiku. AI behavior is layered on only after the engine is proven correct; visuals
come last.

### Four-layer architecture (SPEC §2) — keep these strictly separated
1. **Engine** — pure, deterministic TypeScript state machine (`src/engine/`). No AI, no React, no Next.js,
   no `fs`, no DOM. It runs the BB calendar, enforces every rule, resolves competitions via stat-weighted
   RNG, and tallies votes. **It makes zero creative decisions** — it asks an injected "decider" for those.
2. **Agents** — server-side Claude calls behind a single `AgentDecider` interface (added in Milestone 3).
3. **Tape** — a serializable `SeasonTape` event log the engine writes. It is the source of truth for replay
   and for saved runs.
4. **Player** — a Next.js frontend that reads the tape and renders it as a broadcast (added Milestone 6+).

The engine being a pure module importable by both a CLI script *and* later server actions is what keeps this
project from collapsing. Never import React/Next/`fs`/DOM from `src/engine/`.

---

## 2. Confirmed technical decisions

These were resolved during planning. Treat them as settled; do not re-litigate.

| Area | Decision |
|---|---|
| Framework | **Next.js (App Router) + TypeScript** |
| Package manager | **pnpm** |
| M1 console sim | runs via **`tsx scripts/sim.ts`** — does NOT boot Next.js |
| Tests | **Vitest** (the M1 done-gate is a green property/invariant suite) |
| Engine location | framework-agnostic **`src/engine/`** (no React/Next/`fs`/DOM imports) |
| RNG | seeded **mulberry32** (hand-written, no dependency); seed logged each run for reproducibility |
| Cast generation (M2) | **Claude Sonnet 4.6** (`claude-sonnet-4-6`), once per season |
| In-game agents (M3+) | **Claude Haiku** (`claude-haiku-4-5`) |
| Structured agent decisions (M3) | **Zod** schemas → Anthropic **tool-use**, validated server-side with repair/retry |
| Parallel agent calls (M3–M5) | **real-time, concurrency-limited** (`Promise.all` + `p-limit`, ~5–10 concurrent) + retry |
| Portraits (M2) | **Google GenAI SDK** + a Gemini image model, stored locally |
| Frontend state (M6+) | **Zustand** (playback cursor + god-mode toggles) |
| Styling | **Tailwind CSS** |
| House render (M7) | **react-three-fiber** (true 3D, locked isometric camera, billboarded portrait avatars) |
| Julie TTS (M7) | **OpenAI TTS** (generic preset voice; stylized homage host per SPEC §11 guardrail) |
| Local saves (M8) | plain **JSON `SeasonTape` files** in `runs/` (no database, per SPEC §16) |
| **All API/image/TTS calls** | **server-side only**; keys in `.env`; never shipped to the client |

### Rules defaults (single constants, easy to change later)
- Jury threshold = **9** (an evictee is a juror when `preEvictionHouseSize ≤ 9`; → exactly **7 jurors**).
- Double eviction at **house size 8**.
- Have-nots: count **3**, phase out when **≤5 active**, never include the HOH.

---

## 3. Repository setup / scaffolding steps

> The directory `/Users/jakeparker/Desktop/BigBotter` already contains `SPEC.md` and `PLAN.md`. Scaffold
> **in place** (those two files do not conflict with create-next-app's output). It is **not** yet a git repo.

1. **Scaffold Next.js into the current directory:**
   ```bash
   pnpm create next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
   ```
   (`SPEC.md` and `PLAN.md` are preserved.)

2. **Add the engine path alias** to `tsconfig.json` `compilerOptions.paths` (alongside the default `@/*`):
   ```json
   "@engine/*": ["./src/engine/*"]
   ```

3. **Install Milestone 1 dev dependencies:**
   ```bash
   pnpm add -D tsx vitest
   ```
   (Later milestones add: `@anthropic-ai/sdk` zod p-limit (M3); `@google/genai` (M2); `zustand` (M6);
   `three @react-three/fiber @react-three/drei` (M7); an OpenAI SDK for TTS (M7). Do **not** install these
   until the milestone that needs them.)

4. **Add `package.json` scripts:**
   ```json
   "sim": "tsx scripts/sim.ts",
   "test": "vitest run",
   "test:watch": "vitest",
   "dev": "next dev",
   "build": "next build"
   ```

5. **Create `vitest.config.ts`** (resolve the `@engine/*` alias for tests; node environment for the engine).

6. **Create `.env.example`** with placeholder keys (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`) —
   unused in M1, present for later. Ensure `.env` is gitignored (Next's gitignore already covers `.env*`).

7. **Initialize git** and make an initial commit once M1 scaffolding compiles.

---

## 4. File / folder structure

```
big-botter/
├─ SPEC.md                 # product spec (already present)
├─ PLAN.md                 # this file (already present)
├─ package.json            # pnpm; scripts: sim, test, dev, build
├─ tsconfig.json           # path aliases @/* and @engine/*
├─ vitest.config.ts
├─ .env.example            # placeholder keys (unused in M1)
├─ next.config.ts          # present; the engine never imports it
├─ scripts/
│  └─ sim.ts               # tsx entrypoint: build state0 -> runSeason(seed) -> print to console
├─ src/
│  ├─ engine/              # PURE deterministic TS. No AI / React / Next / fs / DOM.
│  │  ├─ index.ts          # public API barrel (re-exports runSeason, types, etc.)
│  │  ├─ types.ts          # SPEC §14 data model (see §5.1 below)
│  │  ├─ constants.ts      # CAST_SIZE=16, JURY_THRESHOLD=9, VETO_PLAYERS=6,
│  │  │                    #   HAVE_NOT_COUNT=3, HAVE_NOT_PHASEOUT_SIZE=5,
│  │  │                    #   DOUBLE_EVICTION_AT_HOUSE_SIZE=8, morale deltas & clamps
│  │  ├─ rng.ts            # mulberry32 + helpers: nextFloat, int, pick, shuffle, weightedPick
│  │  ├─ houseguestFactory.ts  # makeCast(seed): 16 HGs, random stats+morale, placeholder
│  │  │                    #   names ("HG01"…), empty notebook. Real bios arrive in M2.
│  │  ├─ morale.ts         # deterministic morale deltas + clamp + comp-performance multiplier
│  │  ├─ comps/
│  │  │  ├─ compCatalog.ts # CompType enum + per-type stat-weight vectors + multiRound flags
│  │  │  ├─ compScheduler.ts   # pickHohComp / pickVetoComp / finalHohParts (seeded, real feel)
│  │  │  ├─ performance.ts # scorePerformance(hg, weights, rng)
│  │  │  └─ resolveComp.ts # single-winner resolve + multi-round elimination (OTEV/Knockout)
│  │  ├─ rules/
│  │  │  ├─ eligibility.ts # hohCompEligible, vetoPlayerDraw, evictionVoters, tie logic
│  │  │  ├─ nominations.ts # validate + apply nominations
│  │  │  ├─ veto.ts        # validate veto use, apply, replacement-nom flow
│  │  │  ├─ votes.ts       # tally, majority, HOH tiebreak
│  │  │  └─ haveNots.ts    # select / apply morale drain / expire
│  │  ├─ jury.ts           # isJuror(houseSize), jury vote tally
│  │  ├─ endgame.ts        # Final-4 sole vote, Final-3 3-part HOH, Final-2 jury vote
│  │  ├─ agents/
│  │  │  ├─ decider.ts     # AgentDecider interface (THE SEAM) + DecisionContext types
│  │  │  ├─ randomDecider.ts   # M1: random-but-legal choices (shares engine RNG)
│  │  │  └─ validateDecision.ts # withValidation() repair/retry wrapper (M3-ready)
│  │  ├─ stepper.ts        # phase state machine: step(state, deps) -> {state, events, done}
│  │  ├─ season.ts         # runSeason(seed): drive stepper to completion -> SeasonTape
│  │  └─ tape.ts           # TapeWriter: append events, snapshot state0, build()
│  ├─ render/
│  │  └─ consoleRenderer.ts    # PURE (SeasonTape) -> string[]; broadcast-style lines
│  ├─ engine/__tests__/    # Vitest invariant/property tests (see §5.10)
│  └─ app/                 # Next.js placeholder page (unused in M1; real player arrives M6)
└─ runs/                   # saved tapes as JSON (created in M8)
```

**Module responsibility rule:** each `rules/` file owns exactly one ceremony's validate+apply logic.
`stepper.ts` orchestrates the calendar but contains **no rule math**. Keep modules small and single-purpose.

---

## 5. Milestone 1 — Deterministic Engine (NO AI) — full detail

**Definition of done (SPEC §0/§17):** `pnpm sim` prints a full, rules-correct BB-US season — HOH → noms →
veto → eviction each week, have-nots, a double eviction, jury starting at Final 9 (exactly **7 jurors**), a
3-part final HOH, and a jury vote crowning a winner — all driven by random placeholder agents.
`pnpm test` is green across many seeds. No API calls anywhere.

### 5.0 Load-bearing counting (must be verified by tests)
- 16 houseguests → 2 finalists = **14 evictions** total.
- **Jury is keyed on house size, never week number.** An evictee is a juror iff
  `preEvictionHouseSize ≤ 9` (i.e. post-eviction size ≤ 8). House sizes 9,8,7,6,5,4,3 each send one juror →
  jurors 1–7. This is **double-eviction-proof** because it never references the week.
- 7 pre-jury boots (house sizes 16→10) + 7 jurors = 14. ✓
- With 7 jurors, the Final-2 vote (majority ≥4) can never tie.

### 5.1 `types.ts` — the data model (from SPEC §14)
Define exactly these (copy shapes from SPEC §14): `StatKey` (8 stats: strength, endurance, agility, speed,
iq, memory, charisma, luck), `Stats = Record<StatKey, number>` (1..100), `Houseguest` (id, name, age,
occupation, hometown, bio, personality, talkingStyle, archetype, stats, morale, portraitUrl, status:
`'active'|'evicted'|'jury'`, isHOH, isNominated, hasVeto, isHaveNot, location: `RoomId`, notebook),
`Relationship`, `Memory`, `Deal`, `Grudge`, `Notebook`, `Alliance`, `Phase`
(`'hoh_comp'|'scheme_1'|'nominations'|'scheme_2'|'veto_comp'|'scheme_3'|'veto_ceremony'|'scheme_4'|'eviction'|'final_hoh'|'final_2_jury'`),
`GameState`, the `GameEvent` union, and `SeasonTape = { state0, events }`. Add a `RoomId` union for house
rooms (hoh_room, bedrooms, kitchen, living_room, backyard, diary_room, have_not_room, storage). In M1,
notebook/alliances/relationships exist in the type but are empty/unused (they come alive in M4).

### 5.2 State machine (`stepper.ts`)
Pure transition function:
```ts
function step(state: GameState, deps: { rng: Rng; decider: AgentDecider }): {
  state: GameState; events: GameEvent[]; done: boolean
}
```
It reads `state.phase`, performs that phase's work, emits `GameEvent[]`, and returns the next state with
`phase` advanced. `season.ts` calls `step` repeatedly until `done`. (This per-step shape makes M6
week-by-week pause/resume trivial and every transition independently testable.)

Phase order: `hoh_comp → scheme_1 → nominations → scheme_2 → veto_comp → scheme_3 → veto_ceremony →
scheme_4 → eviction →` (loop back to `hoh_comp`, or enter endgame) `… → final_hoh → final_2_jury` (terminal).

| Phase | M1 work | Events emitted |
|---|---|---|
| `hoh_comp` | clear prior-week flags; schedule comp; eligible = active − outgoing HOH (week 1 = everyone); resolve; set `hohId` + isHOH; morale boost; select have-nots for the week | `host`, `comp` |
| `scheme_1/2/3/4` | **No-op** in M1 (optionally emit one `host` "scheming" beat). These four phases exist now so the calendar shape never changes; M4 fills their bodies with parallel conversations. | (optional `host`) |
| `nominations` | `decider.pickNominations` → validate/repair → set `nomineeIds` + isNominated flags | `ceremony{nomination}` |
| `veto_comp` | build the draw (HOH + 2 noms + 3 drawn incl. a Houseguest's-Choice slot, capped at `min(6, active)`); schedule comp; resolve among the drawn players only; set `vetoHolderId` + hasVeto; morale boost | `comp` |
| `veto_ceremony` | `decider.useVeto`; if used on a nominee → `decider.pickReplacementNom`; update `nomineeIds`/`replacementNomId` | `ceremony{veto}` |
| `eviction` | voters = active − HOH − noms; collect one vote each; tally; HOH breaks a tie only; evict; `isJuror` check sets status `jury` vs `evicted`; expire have-nots; apply morale; compute next phase | `vote`×n, `ceremony{eviction}`, `eviction` |
| `final_hoh` | run the 3-part final HOH; final HOH casts the sole eviction vote at Final 3 | `comp`×3, `ceremony{eviction}`, `eviction` |
| `final_2_jury` | 7 jurors vote; majority wins; set `done=true` | `jury_vote`×7, `host` (finale) |

**Loop → endgame** (decided at the end of `eviction`, by post-eviction active count):
`>4` → `hoh_comp`, `week++`; `==4` → `hoh_comp` for the Final-4 week (normal HOH + veto, but a **sole-vote**
eviction — see §5.5); `==3` → `final_hoh`; after `final_hoh` reduces to 2 → `final_2_jury`.

**Double eviction:** for the week reached at `DOUBLE_EVICTION_AT_HOUSE_SIZE` (8), set an internal
`evictionsThisWeek = 2`. After the first `eviction`, loop back to `hoh_comp` **without** incrementing `week`
and decrement the counter; the scheme phases run compressed (still no-ops). When the counter hits 0,
`week++` normally. Pick have-nots once for the whole DE week. Jury counting stays correct automatically
because it keys on house size.

### 5.3 Competitions (`comps/`)
- `CompType` enum: `Endurance, Puzzle, OTEV, Memory, Physical, Skill, Crapshoot, QnA, Knockout`. Each carries
  a stat-weight vector over the 8 stats (weights ~sum to 1; the remainder is implicit randomness) plus
  `{ multiRound: boolean, roundCount? }`. Rough mappings (tune freely): Endurance→endurance+strength;
  Puzzle→iq+memory+speed; OTEV→memory+iq+agility+speed (multiRound); Memory→memory+iq;
  Physical→strength+agility+speed; Skill→agility+speed+iq; Crapshoot→luck-dominant (near-flat → upsets win);
  QnA→iq+memory+speed; Knockout→mixed (multiRound).
- **Performance score** (`performance.ts`): for houseguest `hg` and weight vector `w`:
  ```
  base      = Σ_stat ( w[stat] * hg.stats[stat] )         // weighted blend of true stats, 1..100
  moraleMul = 0.6 + 0.4 * (hg.morale / 100)               // morale 0..100 → multiplier 0.6..1.0
  luckNudge = 1 + (hg.stats.luck - 50) / 500              // small global nudge, ±~10%
  noise     = 1 + rng.nextFloat(-0.35, +0.35)             // ±35% upset room
  score     = base * moraleMul * luckNudge * noise
  ```
  Highest score wins. Right stats dominate; upsets still happen. Crapshoots are near-pure noise (flat base).
  All randomness flows through the seeded `rng`, so the whole season is reproducible from the seed.
- **Multi-round elimination** (`resolveComp.ts`): for `multiRound` comps, each round re-scores remaining
  players (fresh noise per round; morale/luck persist) and eliminates the lowest; record
  `{ round, scores, eliminatedId }` into the `comp` event's `rounds[]`. The structure is real even though
  M1's "answers" are pure RNG — so M5 can drop in genuine Haiku answers without touching this loop.
- **Scheduler** (`compScheduler.ts`, seeded, stateless — pass in a `usedTypes` set): HOH comps weight toward
  Endurance (especially week 1 and post-DE); Veto comps weight toward OTEV/Skill/Crapshoot/Puzzle (ensure
  OTEV appears ≥1×/season); Final-HOH parts = Endurance / Skill / QnA. Avoid the same type twice in a row.

### 5.4 Rules (`rules/`)
- **Eligibility:** outgoing HOH sits out the next HOH comp (week 1 exempt — no outgoing HOH). HOH + both noms
  cannot vote. HOH breaks ties **only** (log the tiebreak as a distinct vote). Veto draw = `min(6, active)`,
  always including HOH + both noms, with one Houseguest's-Choice slot (`decider.pickHouseguestChoice`,
  random-legal in M1).
- **Nominations:** 2 distinct active HGs, neither the HOH. Reject self-nom/dupes/inactive; repair on failure.
- **Veto:** holder may save self, save a nominee, or use it on no one. If a nominee is saved, HOH names a
  replacement (active; not HOH/holder/remaining-nominee/saved person). HOH-holds-veto and nominee-saves-self
  are both legal. After a save, `nomineeIds.length === 2` and the saved person is excluded.
- **Votes:** plurality of the two nominees is evicted; tie → HOH's pick.

### 5.5 Endgame (`endgame.ts`) + jury (`jury.ts`)
- **Final 4:** normal HOH + veto run; then the eviction is a **sole vote** cast by the one active HG who is
  neither HOH nor a nominee (with 4 players: HOH, 2 noms, 1 voter). No tie, no HOH vote. Evictee = juror #6.
- **Final 3 — 3-part final HOH:** Part 1 = all three (winner → Part 3); Part 2 = the two Part-1 losers
  (winner → Part 3); Part 3 = Part-1 winner vs Part-2 winner → **final HOH**. The "outgoing HOH sits out"
  rule does **not** apply here (all three play Part 1). Final HOH casts the **sole** eviction vote choosing
  who to sit next to. Evictee = juror #7.
- **Final 2:** the 7 jurors each vote for a finalist (`decider.juryVote`); majority (≥4) wins; no tie possible.
- `isJuror(preEvictionHouseSize) = preEvictionHouseSize <= JURY_THRESHOLD`. Evicted HGs become status `jury`
  when `isJuror`, else `evicted`.

### 5.6 Have-nots (`rules/haveNots.ts`)
Each week, pick `HAVE_NOT_COUNT` (3) from active HGs **excluding the HOH** (random draw in M1; leave a hook to
tie it to a comp in M5). Apply a morale drain for the week; **reverse it exactly at week end** (track the
delta separately so clamping doesn't cause drift). Set/clear `isHaveNot`. Disable selection entirely when
active ≤ `HAVE_NOT_PHASEOUT_SIZE` (5).

### 5.7 Morale (`morale.ts`)
Start each HG at a seeded 60–80, clamp to [0,100] after every delta. Suggested deltas (constants, tunable):
win HOH +12, win veto +10, saved by veto +8, nominated −10, survive the block +5, survive the week +2,
have-not −15 (weekly, reversed at expiry). Morale multiplies comp performance via `moraleMul` (§5.3).

### 5.8 Agent seam (`agents/`)
`AgentDecider` interface — **every method async** so a future `HaikuDecider` slots in with zero engine
changes. M1-active methods: `pickNominations`, `useVeto`, `pickReplacementNom`, `castEvictionVote` (also used
for tiebreak and the Final-4 sole vote), `finalHohEviction`, `juryVote`, `pickHouseguestChoice`. Plus
M4-stubbed social hooks (no-ops in M1): `decideMovement?`, `initiateConversation?`, `speakTurn?`,
`acceptDeal?`, `confessional?`. Each method receives a read-only `DecisionContext` (minimal in M1; expands in
M3). `RandomDecider` implements every active method as seeded-random-but-legal, sharing the engine's `rng`.
`withValidation(decideFn, validateFn, repairFn, maxRetries=3)` wraps every decision: illegal → repair/retry →
guaranteed-legal fallback. M1 randoms are always legal, but a test must feed an intentionally-illegal stub
decider to prove the repair path works (M3-readiness).

### 5.9 Tape (`tape.ts`) + console renderer (`render/consoleRenderer.ts`)
`TapeWriter(state0)` with `append(e)` and `build(): { state0, events }`. M1 emits `host`, `comp`, `ceremony`
(nomination/veto/eviction), `vote`, `eviction`, `jury_vote`. The `conversation`/`confessional`/`movement`
event kinds exist in the type but are produced later (M4–M5). `state0` = deep-frozen initial `GameState`
(week 1, phase `hoh_comp`); store the seed on it and log it.
`consoleRenderer.ts` is a **pure** `(SeasonTape) => string[]` so it's testable. `scripts/sim.ts` builds
`state0`, calls `runSeason(seed)`, prints. Output must let a human eyeball correctness: week headers, comp
type + winner/score, noms, veto result + ceremony, "by a vote of X to Y", eviction + post-eviction house
size, **JUROR #n** tags, a `*** DOUBLE EVICTION ***` marker, Final-4 sole vote, the three final-HOH parts,
and a finale jury tally + winner, ending with a summary line ("14 evictions, 7 jurors, 1 winner").

### 5.10 Tests (Vitest, `src/engine/__tests__/`) — the real done-gate
Run the full season across many seeds (e.g. 200) and assert invariants on each tape:
- **Invariants:** exactly 14 evictions; terminates with exactly 2 finalists and 1 winner (∈ finalists);
  exactly 7 jurors; every `eviction.toJury === (preEvictionHouseSize ≤ 9)`; the 7 jurors are the evictees at
  house sizes 9,8,7,6,5,4,3; active count is monotonically non-increasing.
- **Eligibility:** the outgoing HOH never appears in the immediately-following HOH comp's players (week 1
  exempt); no voter is ever the HOH or a nominee; the HOH votes iff the non-HOH tally was tied.
- **Veto:** draw size `min(6, active)`, always includes HOH + both noms; replacement always legal; after a
  save `nomineeIds.length === 2` and the saved person is excluded.
- **Votes:** evictee = plurality nominee; tie → HOH's pick; the Final-4 eviction has exactly one voter.
- **Double eviction:** a DE week drops the house by exactly 2 with no `week++` between the two evictions, and
  produces correct juror numbering across the threshold.
- **Morale:** always clamped to [0,100]; the have-not weekly drain is reversed exactly.
- **validateDecision:** an intentionally-illegal stub decider gets repaired; the engine never applies an
  illegal decision.

### 5.11 Milestone 1 task order
1. Scaffold the repo (§3): Next.js + TS + Tailwind + pnpm, Vitest, tsx, `@engine/*` alias, scripts, `.env.example`.
2. `types.ts` + `constants.ts` + `rng.ts`.
3. `houseguestFactory.ts` (placeholder cast) + `morale.ts`.
4. `comps/` (catalog, performance, resolveComp incl. multi-round, scheduler).
5. `rules/` (eligibility, nominations, veto, votes, haveNots) + `jury.ts`.
6. `agents/` (decider interface, RandomDecider, validateDecision).
7. `stepper.ts` (weekly loop) + `endgame.ts` + `season.ts` + `tape.ts`.
8. `render/consoleRenderer.ts` + `scripts/sim.ts`.
9. Vitest invariant suite (§5.10); iterate until green across many seeds.
10. Commit. **This is the gate for Milestone 2.**

---

## 6. Milestones 2–8 — outline (per SPEC §17)

Each is one focused phase. Do them in order; the engine's `Houseguest` shape and `AgentDecider` interface are
designed so these layer on with minimal-to-zero changes to M1 code.

- **M2 — Cast generation + portraits.** Replace `houseguestFactory`'s placeholder cast with a one-time
  **Sonnet 4.6** call producing 16 rich bios + profile-derived stats with enforced archetype variety (no
  all-floater seasons), plus optional manual additions. Add **Gemini** portrait generation (Google GenAI
  SDK), stored locally and reused everywhere. Same `Houseguest` shape → no engine change. (Server-side only.)
- **M3 — Agent decisions (Haiku + tool-use).** Implement `HaikuDecider` against the existing `AgentDecider`
  interface using strict **Zod**/tool-use schemas for nominations/veto/replacement/votes/final-HOH/jury. All
  outputs flow through the existing `withValidation` repair/retry wrapper. Concurrency-limited (`p-limit`)
  calls. The engine and stepper are untouched — you only swap `RandomDecider` for `HaikuDecider`.
- **M4 — Social system.** Bring `Notebook` to life with **strict info asymmetry** (an agent knows only what it
  witnessed, was told, or overheard). Fill the `scheme_1..4` phase bodies with parallel, multi-turn
  conversations (1-on-1 first, then group), and add the spatial room-movement + blocking layer. Begin
  emitting `conversation`/`movement` events. Formal alliances, deals, showmances, unlimited lying, grudges
  that carry to the jury. The Memory stat + event magnitude govern recall/decay.
- **M5 — Flavor.** Confessionals throughout (the comedic/strategic core); **Julie** host narration across the
  episode; **OTEV** with Haiku-generated rhyming clues drawn from the season's real events; wire genuine
  Haiku comp answers into the multi-round structure already built in `resolveComp`; finalize the have-not
  morale tie-in.
- **M6 — Tape + replay player.** Server actions import `src/engine/` unchanged for week-by-week generation.
  Build the Next.js player that reads a `SeasonTape` (Zustand for the playback cursor + god mode):
  **memory wall first**, then the house map. Auto-advance, no skipping, rewind supported.
- **M7 — Visual polish.** **react-three-fiber** isometric 3D house with moving avatars; cinematic broadcast
  ceremony/eviction-night staging; full BB visual language (memory-wall portraits grayscale on eviction, HOH
  crown, ON THE BLOCK tags, veto medallion, eye logo, BB color scheme); god mode; cosmetic predictions;
  **OpenAI TTS** for Julie (generic voice, stylized homage host).
- **M8 — Persistence + debugging.** Local save/replay of runs (`SeasonTape` → JSON in `runs/`); heavy
  agent-call logging (prompt, response, parsed decision) and every engine state transition to a debug log;
  a simple log viewer if useful.

**V1 scope (SPEC §16):** the only twist is the double eviction; no database (local files); no
play-as-a-houseguest; not deployed to Vercel. Other twists, sim-sprung surprises, and deterministic
same-season replay seeds are deferred (though the engine logs a seed for free).

---

## 7. Verification

**Milestone 1 (the gate for everything else):**
1. `pnpm test` — the Vitest invariant suite is green across many seeds (counts, eligibility, veto, votes,
   double eviction, morale, repair).
2. `pnpm sim` — read the printed season top to bottom and confirm by eye: HOH/noms/veto/eviction each week;
   have-nots listed; a `*** DOUBLE EVICTION ***` week that drops the house by 2; jury starting at Final 9 with
   JUROR #1..#7 tags; a 3-part final HOH; a jury vote with a sensible tally; and the closing
   "14 evictions, 7 jurors, 1 winner" line.
3. Re-run `pnpm sim` with the **same seed** → byte-identical output (determinism). A **different seed** →
   a different but still-valid season.

**Later milestones:** M2 — inspect a generated cast JSON + portraits for variety and sane stat derivation.
M3 — diff a Haiku-driven season against a random one for legality (the validation layer should reject nothing
illegal) and strategic plausibility. M4+ — spot-check tapes for info asymmetry (no agent acts on information it
never witnessed) and exercise the replay player. The heavy logging from M8 backs all of this.
