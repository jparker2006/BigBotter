# Big Botter — Build Spec (V1)

> *Big Brother, but it's bots.*

A multi-agent simulation of **Big Brother US**, as faithful to the real show as possible. 16 AI houseguests — each with a real personality, stats, alliances, lies, showmances, and confessionals — play a full season (comps, nominations, vetoes, evictions, jury) while you watch it unfold like a broadcast. Powered by Haiku so we can spam agent calls cheaply.

**Pitch:** *hilarious* and *extremely strategic* at the same time. Rated R. Every agent only knows what a real player's brain would know.

---

## How to use this spec — read first (for Claude Code / plan mode)

**This is a brand-new (greenfield) project — there is no existing code yet.** Read this entire spec, then produce a plan. Do not write any code until the plan is approved.

**What I want from this planning pass:**
1. A **phased implementation plan for the whole project**, following the Build Order in §17, with **Milestone 1 detailed enough to start executing immediately**.
2. **Build incrementally — do not attempt the whole thing at once.** The single most important rule: build the **deterministic engine first** (Milestone 1), with comps resolved as plain stat-weighted RNG and **placeholder/random agent decisions**, so a full, rules-correct season can be simulated end-to-end **with zero API calls**. AI behavior, then visuals, come only after the engine is proven correct.
3. Before finalizing the plan, **ask me about any ambiguities and library choices** — state management, the isometric/3D house rendering approach, TTS provider, local-save format, parallel-call orchestration, etc. — and surface any assumptions you're making.

**Tech constraints (non-negotiable):**
- **Next.js (App Router) + TypeScript.**
- **All model / image / TTS calls run server-side** (API routes or server actions); keys live in `.env` and never reach the client.
- Keep the **four-layer separation** from §2 (Engine / Agents / Tape / Player). The engine is pure TypeScript with **no AI**.
- Use the **data model** in §14 as the starting shape.
- In-game agents use Claude **Haiku** (`claude-haiku-4-5`); cast generation uses a heavier model; portraits use **Gemini**; Julie uses **TTS**.

**Definition of done for Milestone 1:** I can run a script (no UI yet) and watch a **full, rules-correct Big Brother US season** play out start to finish in the console — HOH → nominations → veto → eviction each week, have-nots, **a double eviction**, jury beginning at Final 9, a 3-part final HOH, and a jury vote that crowns a winner — all driven by random placeholder agents. Once that's solid, we move to Milestone 2.

---

## 1. Tech stack & models

- **App:** Next.js (runs locally on a laptop for now; Vercel-ready later).
- **In-game agents:** Claude **Haiku** (`claude-haiku-4-5`) — every decision, every line of dialogue, every confessional, comp answers, OTEV clues, Julie's narration. Call it freely; it's cheap.
- **Cast generation (one-time per season):** a **heavier model** (Sonnet/Opus-tier) to generate rich 16-person casts with full bios and stats. Only runs once at season start, so cost is fine.
- **Portraits:** **Gemini** image generation (key TBD by you). Photoreal, generated once per houseguest at season start, stored locally, reused everywhere.
- **Voice:** **TTS for Julie** (a generic voice — see §12 guardrail).
- **Keys:** All API keys live **server-side** (Next.js API routes / server actions, in `.env`). The browser only ever talks to our own endpoints. Never ship a key to the client.

---

## 2. High-level architecture

Four clean layers. Keep them separate — it's what keeps a project this complex from collapsing.

1. **The Engine** — deterministic TypeScript. A state machine that steps through the BB calendar. It makes **zero** creative decisions: it runs the schedule, tracks who's left, enforces the rules, decides *whose turn it is to think*, resolves comps, and tallies votes. No AI in here.
2. **The Agents** — Haiku calls. Given a houseguest's persona + private notebook + the public game state + a specific ask, they return decisions and dialogue. Structured decisions use **tool-use** with strict schemas (see §16).
3. **The Tape** — the engine writes the entire season to a single **serializable event log** (comps, movements, conversations, confessionals, ceremonies, host segments, votes). This is the source of truth for playback and is what gets **saved locally** so runs can be re-watched.
4. **The Player** — the frontend reads the tape and renders it as a broadcast with pacing and animation. God mode is trivial because everything is already in the tape.

**Compute model:** pre-compute the season into the tape, then replay it. (Generate week-by-week if you want to start watching sooner.) This gives polished, spinner-free playback, easy god mode, and saveable/replayable runs — exactly what we want for a spectator V1.

---

## 3. Cast generation

- **16 houseguests**, freshly generated **every season**.
- **You can optionally add some houseguests yourself**; the heavier model fills the remaining slots.
- Each houseguest is a **full real person**: name, age, occupation, hometown, backstory, personality, quirks, talking style, and a **play-style archetype** (villain, floater, loyalist, chaos agent, social butterfly, comp beast, mastermind-who's-actually-bad, etc.).
- **Both** original characters and parody-archetype flavors riffing on classic BB player types.
- **Guaranteed variety:** assignment is random, but enforce a **mix** of play styles so no season is all floaters.
- **Stats are derived from the profile** (see §4) — an athlete gets high physical stats, a scientist gets high IQ — with randomness layered on.

---

## 4. Stats system

Fixed traits, **1–100 scale**, **shown on each houseguest's card to you (the viewer)** but **hidden from other houseguests** (they have to *guess* who the comp threats are — that's strategy).

**My recommended expanded stat set** (you wanted more; these map cleanly onto real BB comp types):

| Stat | Drives |
|---|---|
| **Strength** | Physical/obstacle comps |
| **Endurance** | Endurance comps (hang-on-the-wall, last-to-drop) |
| **Agility** | Precision/skill comps, the OTEV slide |
| **Speed** | Timed/reflex comps |
| **IQ** | Puzzle comps, knowledge comps |
| **Memory** | Memory comps ("before/after," morph), OTEV clues, jury recall |
| **Charisma** | **Social influence** — boosts persuasion in conversations (a high-charisma agent shifts a target's opinion more) |
| **Luck** | Crapshoot comps + a small nudge everywhere |

Plus one **dynamic stat**:

- **Morale / Energy** — fluctuates during play. **Have-not status drains it** (§7), bad weeks lower it, comp wins and safety raise it. It acts as a **multiplier on comp performance** and makes low-morale agents crankier/more desperate socially.

**Derivation rule:** the cast-gen model sets base stats from the bio (athlete → high Strength/Endurance/Agility; scientist → high IQ/Memory; salesperson → high Charisma), then applies randomness so it's believable but not deterministic.

---

## 5. Game rules — BB-US, to a tee

Follow real **BB-US rules exactly**. Realism is the whole point.

**Format:** 16 houseguests → **Final 2**.

**Weekly loop:**
1. **HOH competition** (loser-of-nothing; everyone eligible except the outgoing HOH).
2. 🗣️ Scheme — lobby the HOH.
3. **Nominations** — HOH names **2** nominees (+ confessional).
4. 🗣️ Scheme — nominees scramble.
5. **Veto competition** — 6 players: HOH + 2 noms + 3 drawn (include the **Houseguest's Choice** chip).
6. 🗣️ Scheme — pressure the veto holder (the juiciest window).
7. **Veto ceremony** — holder uses it or not; if used on a nominee, HOH names a **replacement** (+ confessionals).
8. 🗣️ Scheme — final vote-wrangling (this window produces blindsides).
9. **Eviction vote** — every active houseguest votes **except the HOH and the 2 nominees**. **HOH votes only to break a tie.** (+ confessionals)
10. **Eviction** — most votes goes home (→ jury once we're deep enough).

**Standard rules to enforce:** outgoing HOH sits out the next HOH comp; nominees can't vote; HOH breaks ties only.

**Have-nots:** real BB mechanic (§7).

**Jury:** begins at **Final 9** (the Final 9 eviction sends the first juror). That yields a **7-member jury**.
> *Judgment-call note:* "jury starts at Final 9" classically produces a **7-person jury** (evictees from Final 9 down through Final 3). Recent seasons sometimes run a 9-person jury by starting jury at Final 11 — easy to switch later if you want that. 7 is clean (no tie possible).

**Endgame:**
- **Final 3:** **3-part final HOH** competition (Part 1 = all three; Part 2 = the two who lost Part 1; Part 3 = the two winners head-to-head). The final HOH casts the **sole vote** to evict, choosing who they sit next to.
- **Final 2:** each finalist gives a **plea to the jury**, the **jury asks questions**, then the **7 jurors vote** for the winner. Majority wins. Jurors vote based on **gameplay respect + how they were treated** (so jury management and grudges matter — §10).

---

## 6. Competitions

**Mirror real BB:** a full catalog of comp types, randomly scheduled but **distributed to feel like a real season** (endurance comps tend to be HOH; OTEV tends to be a veto; crapshoots and skill comps sprinkled in; etc.).

**Catalog (examples):** endurance (wall/hang), puzzle, **OTEV**, memory ("before/after," face-morph), physical/obstacle, skill/precision, crapshoot (luck-based, e.g. BB Roulette), Q&A / "BB Comics," knockout.

**Resolution — agents actually play, and stats matter:**
- **Knowledge comps** (OTEV, memory, Q&A, comics): generate the questions **from the real history of this season** via Haiku, then have each agent **actually answer** (Haiku call). Final per-round success = their genuine answer **blended with** the relevant stat (IQ/Memory) + randomness + morale. So smart agents genuinely win more, but upsets happen.
- **Physical / endurance / skill comps:** no bodies to simulate, so resolve via a **stat-weighted performance score + randomness + morale**, and have Julie narrate it play-by-play. The right stats dominate; upsets still occur (real life has randomness too).

**OTEV (showcase veto comp):** a punny animatronic creature (a different one each season). **Haiku generates its rhyming clues from the season's actual events** ("which houseguest got backdoored in week 3?"). Multi-round **elimination**: each round, answer + race down the slippery slide; slowest/wrong is out; last standing wins the veto. Tests **Memory/IQ** (answers) + **Agility/Speed** (slide).

**All comps are visually playable/watchable** in the replay (§14).

---

## 7. Have-nots

Works **exactly like real BB**:
- Each week, a set of houseguests become **have-nots** for the week (default: a small group chosen by the standard method — tie to a comp or random draw; tunable).
- Consequences: have-not room, slop only, cold showers — represented in-sim as a **Morale/Energy drain** for the week, which lowers comp performance and makes them more on-edge socially.
- Expires at the end of the week.

---

## 8. The social system — the heart of the sim

**Full, multi-turn conversations**, **group and 1-on-1**, **as close to real life as possible**.

- **Spatial & room-based:** agents occupy rooms in the house. To talk to someone, an agent must **physically go to where they are**. If the target is in a room **with their enemy**, the agent may have to wait, pull them aside, or come back later. Movement is simulated and visible on the house map.
- **Parallel:** multiple conversations happen **simultaneously** in different rooms (like real BB feeds). Run these agent calls in parallel.
- **Volume:** number of conversations **scales with house size and the strategic state** (more scheming when stakes are high). Don't worry about call volume — Haiku is cheap, make it fun.
- **Length:** **variable**, driven by the conversation itself; agents decide when it's done.
- **Who talks to whom:** agents **choose who to approach** based on their goals; resolved through the spatial/room layer above.
- **Scheming windows:** the four marked in §5.

---

## 9. Alliances, deals, showmances, lying

All **formal and tracked**, all **as in real life**:
- **Alliances:** named, tracked entities. Agents **form, join, and betray** them. Secret by default.
- **Deals/promises:** agents can make **any deal** and **keep or break it at will**. Tracked; a broken deal is **remembered** (weighted by magnitude — §11).
- **Showmances:** a relationship type. If you're in one, that's typically your **#1 ally**. (Hilarious and strategically huge.)
- **Lying:** **unlimited, no constraints.** It's a game.
- **Grudges/betrayals carry to the jury vote.**

---

## 10. Agent memory / notebook (strict info asymmetry)

Each houseguest carries a private **notebook** = everything a real BB player's brain would hold:
- per-person **relationships** (trust −100…100, sentiment, showmance flag),
- **alliances** they're in,
- current **targets**,
- **deals/promises** made and received,
- **secrets** they know,
- **reads/suspicions** (who they think is lying or working together),
- **grudges**,
- a weighted **memory log** of events they witnessed.

**Rules:**
- **Strict asymmetry — no omniscience.** An agent only knows what it **witnessed, was told, or overheard** (overhearing is possible if it's in the room). This is what creates blindsides.
- **Updates after every conversation** (and key events).
- **Memory realism:** the **Memory stat** governs recall, and info is weighted by **magnitude** — someone backdooring your #1 ally sticks forever; a small slight fades. Low-Memory agents forget more.

---

## 11. Confessionals, host (Julie) & narration

- **Confessionals (diary room):** generated **throughout** — the comedic and strategic core. Every move comes with a private to-camera confessional that often contradicts what the agent said to people's faces. God mode surfaces all of them.
- **Julie (host):** narrates **throughout, like an episode** — intros, "but first…", checking in on the house, the nomination/veto/eviction ceremonies, the live eviction interview, the vote reveal ("by a vote of 5 to 2…"), and the finale.
- **TTS for Julie.**
> *Guardrail:* build **Julie as a stylized homage host** — an original character who nails the BB-host role, catchphrases, and energy — **not** a photoreal likeness or a voice-clone of the real person, and don't present fabricated lines as real quotes. Use a **generic TTS voice**. You lose none of the iconic energy and it stays clean.
- **OTEV** gets its own distinct **punny animatronic voice**.

---

## 12. The watch experience

- **Spectator-only for V1** (play-as-a-houseguest comes later).
- **Auto-advancing playback with a replay system.** **No skipping** — everything plays out fully. **Rewind** supported.
- **Continuous live-feed-style viewing**, plus a **weekly overview/recap** of what happened.
- **God mode:** you see **everything** — all rooms, all confessionals, all notebooks, all stats.
- **Predictions:** you can make predictions **for your own fun**; they have **no effect on gameplay**.
- **Saved runs** are re-watchable (§13).

---

## 13. Visuals — super visual, as close to real BB as possible

- **Photoreal AI-generated portraits** per houseguest (Gemini), generated once at season start, stored locally, reused on the memory wall, diary-room chair, cards, and lower-thirds. (Original fictional people.)
- **Isometric, realistic 3D house** mirroring the real BB layout: HOH room, bedrooms, kitchen, living room, backyard, diary room, have-not room, storage.
- **Avatars actually move around** the house in real time during social phases.
- **Full BB broadcast visual language:** the **memory wall** (portraits go **grayscale on eviction**, **crown** on HOH, **"ON THE BLOCK"** tags on nominees, **veto medallion** on the holder), diary-room chair, lower-thirds, the **eye logo**, BB color scheme, ceremony staging.
- **Aesthetic:** match real BB — bright house feeds + the surveillance/live-feed framing for the social game; darker, cinematic **broadcast** staging for ceremonies and eviction night.
- **Comps are visually playable/watchable** in the replay.
- **Target:** desktop/laptop web.

---

## 14. Data model (sketch for Claude Code)

```ts
type StatKey =
  | 'strength' | 'endurance' | 'agility' | 'speed'
  | 'iq' | 'memory' | 'charisma' | 'luck';

type Stats = Record<StatKey, number>; // 1..100

interface Houseguest {
  id: string;
  name: string; age: number; occupation: string; hometown: string;
  bio: string; personality: string; talkingStyle: string;
  archetype: string;                 // play style
  stats: Stats;
  morale: number;                    // dynamic
  portraitUrl: string;
  status: 'active' | 'evicted' | 'jury';
  isHOH: boolean; isNominated: boolean; hasVeto: boolean; isHaveNot: boolean;
  location: RoomId;
  notebook: Notebook;
}

interface Relationship {
  targetId: string;
  trust: number;                     // -100..100
  sentiment: string;
  isShowmance: boolean;
  notes: string;
}

interface Memory { what: string; magnitude: number; week: number; }
interface Deal { id: string; partyIds: string[]; terms: string; week: number;
  status: 'active' | 'honored' | 'broken'; }
interface Grudge { againstId: string; what: string; magnitude: number; week: number; }

interface Notebook {
  relationships: Record<string, Relationship>;
  allianceIds: string[];
  targetIds: string[];
  deals: Deal[];
  secretsKnown: string[];
  reads: string[];                   // suspicions
  grudges: Grudge[];
  memoryLog: Memory[];               // decays by magnitude + memory stat
}

interface Alliance {
  id: string; name: string; memberIds: string[];
  formedWeek: number; isActive: boolean; secret: boolean;
}

type Phase =
  | 'hoh_comp' | 'scheme_1' | 'nominations' | 'scheme_2'
  | 'veto_comp' | 'scheme_3' | 'veto_ceremony' | 'scheme_4'
  | 'eviction' | 'final_hoh' | 'final_2_jury';

interface GameState {
  seasonId: string;
  week: number;
  phase: Phase;
  isDoubleEviction: boolean;
  houseguests: Houseguest[];
  hohId: string | null;
  nomineeIds: string[];
  vetoHolderId: string | null;
  replacementNomId: string | null;
  alliances: Alliance[];
  juryIds: string[];
  haveNotIds: string[];
}

// THE TAPE — what the engine writes and the player reads/replays
type GameEvent =
  | { t: 'host'; text: string }
  | { t: 'comp'; compType: string; rounds: any[]; results: Record<string, number>; winnerId: string }
  | { t: 'movement'; hgId: string; from: RoomId; to: RoomId }
  | { t: 'conversation'; roomId: RoomId; participantIds: string[];
      turns: { speakerId: string; text: string }[] }
  | { t: 'confessional'; speakerId: string; text: string }
  | { t: 'ceremony'; kind: 'nomination' | 'veto' | 'eviction'; payload: any }
  | { t: 'vote'; voterId: string; targetId: string; confessional?: string }
  | { t: 'eviction'; evictedId: string; toJury: boolean }
  | { t: 'jury_vote'; jurorId: string; finalistId: string; reasoning: string };

interface SeasonTape { state0: GameState; events: GameEvent[]; }
```

---

## 15. Validation & logging

- **Validation layer:** every agent decision is checked against the rules before it's applied (e.g., a vote must target an actual nominee; noms must be eligible). On an illegal/garbled response, **retry or repair**. Use **tool-use with strict schemas** for all hard decisions (nominations, veto use, replacement, votes, who-to-approach, deal accept/reject) so outputs always parse.
- **Heavy logging:** this is a complex project — log **every** agent call (prompt, response, parsed decision) and every engine state transition, to a local debug log. Build a simple log viewer if useful.

---

## 16. V1 scope

**IN (everything above, except what's listed as deferred):**
16-houseguest fresh-generated cast (optional manual additions) with full bios; profile-derived stats + the expanded stat set + dynamic morale; full BB-US ruleset to Final 2 with 3-part final HOH, jury at Final 9 (7 jurors), jury pleas + Q&A + vote; **real comps every week** (agents play, stats matter) including **OTEV**, all visually playable; **have-nots** (morale drain); **double eviction** (the only twist in V1); full **spatial, parallel, multi-turn group + 1-on-1 conversations** with room movement and blocking; **formal alliances, deals, showmances, unlimited lying, grudges→jury**; **strict info asymmetry** with per-agent notebooks, Memory stat + magnitude weighting; **spectator mode** with auto-advance + replay, no skip, rewind, live feed + weekly recap, **god mode**, cosmetic **predictions**; **photoreal portraits**, isometric realistic house, moving avatars, full BB visual language; **Julie host with TTS** narrating throughout; local run saving; parallel calls; heavy logging.

**OUT / LATER (you explicitly deferred these):**
- Twists beyond double eviction (Coup d'État, Diamond Veto, Battle Back, BB Comics as a twist, secret powers, etc.).
- Sim-sprung random surprise twists.
- Play-as-a-houseguest mode.
- A real database (use local files for now).
- Deterministic same-season replay seeds (revisit; the engine can still log a seed for free).
- Vercel deployment.

---

## 17. Suggested build order

Build the **deterministic skeleton first** (testable without burning a single API call), then layer AI, then presentation.

1. **Engine core (no AI):** state machine, full week loop, all BB rules, comps as pure stat-weighted RNG, double eviction, have-nots, endgame + jury. Simulate a whole season in the console with placeholder "agents." This is your backbone.
2. **Cast generation:** heavier-model 16-person cast + profile-derived stats + optional manual additions. Then portraits (Gemini).
3. **Agent decisions via Haiku + tool-use:** replace placeholder choices with real nominations, veto, votes, final-HOH decisions; add the validation/retry layer.
4. **Social system:** notebooks + info asymmetry, then conversations (1-on-1 first, then group), then the spatial/room movement + blocking layer.
5. **Flavor:** confessionals, Julie narration, OTEV (with generated clues), tie have-not morale into comps.
6. **The tape + replay player:** wire the event log; build the frontend player — memory wall first, then the house map.
7. **Visual polish:** isometric house, moving avatars, broadcast ceremonies/eviction night, god mode, predictions, TTS.
8. **Persistence + debugging:** local save/replay of runs, log viewer.

---

## 18. Open / revisit later

- Jury size (7 vs 9) — currently 7; trivial to switch.
- Have-not selection method — currently default/random; can match a specific season's method.
- Same-season deterministic replay (seeds) — deferred but cheap to log now.
