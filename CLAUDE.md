# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Big Botter is a spectator simulation of *Big Brother US*: 16 AI houseguests play a full season (comps, nominations, vetoes, evictions, alliances, jury) that you watch back as a broadcast-style replay. `SPEC.md` is the product spec and `PLAN.md` is the phased build plan (milestones M1–M8). The build order is deliberate: the deterministic engine first, then AI agents, then visuals.

## Commands

Package manager is **pnpm**. Console scripts run via `tsx` and do **not** boot Next.js — the engine is plain TypeScript.

- `pnpm dev` — Next.js dev server (the watch UI). `pnpm build` / `pnpm start` for production.
- `pnpm test` — Vitest engine suite; `pnpm test:watch` to watch.
  - Single file: `pnpm exec vitest run src/engine/__tests__/season.test.ts` — or by name: `pnpm exec vitest run -t "<test name>"`.
- `pnpm lint` — ESLint.
- `pnpm sim` — simulate a full season to the console with the deterministic `RandomDecider` (zero API calls). Fast; the main way to exercise the engine.
- `pnpm sim:haiku [--seed=123]` — simulate a season with real Haiku agents (needs `ANTHROPIC_API_KEY`; slow — hundreds–thousands of calls).
- `pnpm generate:cast` / `pnpm generate:portraits` — one-time M2 cast (Sonnet) and portrait (Gemini) generation into `data/casts/` and `public/generated/portraits/` (need keys).

## Architecture — four layers (keep them separate)

The whole design rests on a clean split (see `SPEC.md` §2):

1. **Engine** — `src/engine/`. Pure, deterministic TypeScript: a phase state machine that runs the BB calendar, enforces every rule, resolves comps via seeded RNG, and tallies votes. **It makes zero creative decisions and must never import AI, React, Next, `fs`, or the DOM.** This purity is what lets both the `tsx` scripts and the Next server actions import it unchanged.
2. **Agents** — every choice comes from an injected `AgentDecider` (`src/engine/agents/decider.ts`). The engine `await`s this interface for nominations, veto, votes, final HOH, and jury, plus *optional* social/confessional/host/comp-answer hooks. Two implementations: `RandomDecider` (deterministic, in-engine, instant) and `HaikuDecider` (`src/server/agents/haikuDecider.ts`, real Claude Haiku via tool-use). Swapping deciders requires **no engine changes**; all decider methods are async.
3. **Tape** — the engine writes a serializable `SeasonTape = { state0, events: GameEvent[] }` (`src/engine/tape.ts`; types in `src/engine/types.ts`). This is the single source of truth for playback and saving.
4. **Player** — the frontend reads the tape and renders it as a broadcast.

### Engine control flow
`src/engine/stepper.ts` is the state machine: `step(state, { rng, decider })` runs one phase and returns `{ state, events, done }`. `src/engine/season.ts` `runSeasonWithDecider(...)` loops `step` to completion and returns the tape. Endgame (Final 4 sole vote, 3-part final HOH, jury vote) is in `src/engine/endgame.ts`; per-ceremony rules in `src/engine/rules/`; the spatial scheming system in `src/engine/social/`. Every decision is wrapped by `withValidation` (`src/engine/agents/validateDecision.ts`), which repairs/retries illegal outputs and falls back to a legal default — so a garbled Haiku response never breaks a season.

### Flavor is decider-driven with template fallback
`src/engine/flavor.ts` (host narration, confessionals), `resolveComp` (knowledge-comp questions/answers), and `social/socialSystem.ts` (conversations) call the decider's **optional** methods when present and otherwise emit deterministic templates, catching per-call errors. So `RandomDecider` yields templated flavor; `HaikuDecider` yields real AI dialogue/confessionals/clues. This is why the same engine produces both an instant placeholder season and a full AI season.

### The watch path
`src/app/actions.ts` `generateReplayTape(seed, useHaiku)` (a server action) loads the cast from `data/casts/m2-cast-001.json`, builds `state0`, picks `HaikuDecider` (key-gated) or `RandomDecider`, and runs the season. `src/app/ReplayPlayer.tsx` drives playback; `src/app/replayModel.ts` `buildReplayFrame(tape, cursor)` derives the on-screen state from the event log; `src/app/replayStore.ts` (Zustand) holds cursor/play/god-mode. The 3D house is `House3D.tsx` (react-three-fiber, loaded client-only via `next/dynamic`); broadcast staging is `BroadcastStage.tsx`.

### Server / API boundary
`src/server/` holds **all** outbound API integrations: Anthropic (`agents/anthropicTool.ts`, model `claude-haiku-4-5`, concurrency-limited with `p-limit`), Gemini portraits (`google/portraits.ts`), and cast generation (`cast/`); Julie TTS (OpenAI) lives in `actions.ts`. Keys load from `.env` via `src/server/env.ts` (`loadRootEnv` / `requireEnv`). Never import `src/server/` from a client component.

## Conventions & invariants

- **Determinism:** the same seed reproduces a season **only on the RandomDecider path**; Haiku runs at temperature 0.7 and is non-deterministic. RNG is seeded mulberry32 (`src/engine/rng.ts`) — thread the single `rng` instance rather than creating ad-hoc randomness.
- **BB rules:** jury is keyed on **house size** at eviction (≤9 → juror, yielding exactly 7 jurors), *not* week number — so it survives the double eviction (triggered at house size 8). These invariants are asserted across many seeds in `src/engine/__tests__/season.test.ts`; keep that green.
- **react-three-fiber + StrictMode:** `reactStrictMode` is **disabled** in `next.config.ts` on purpose — StrictMode's dev double-mount force-loses R3F's WebGL context and blanks the 3D house. Don't re-enable it without handling context loss.
- **Path aliases:** `@engine/*` → `src/engine/*`, `@/*` → `src/*` (tsconfig + vitest). The `tsx` console scripts use relative imports.
