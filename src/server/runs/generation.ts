import { existsSync } from "node:fs";
import type { AgentDecider } from "../../engine/agents/decider";
import { RandomDecider } from "../../engine/agents/randomDecider";
import { createInitialState, createInitialStateFromCast } from "../../engine/houseguestFactory";
import { createRng, type Rng } from "../../engine/rng";
import type { GameState, SeasonTape } from "../../engine/types";
import { AnthropicToolCaller } from "../agents/anthropicTool";
import { HaikuDecider } from "../agents/haikuDecider";
import { loadGeneratedCast } from "../cast/loadCast";
import { loadRootEnv } from "../env";
import { createRunLogger, type RunLogger } from "./runLogger";
import { saveRun, type RunMeta, type RunMode } from "./runStore";

const DEFAULT_CAST_PATH = "data/casts/m2-cast-001.json";

export type SeasonContext = {
  id: string;
  savedAt: string;
  seed: number;
  rng: Rng;
  state0: GameState;
  decider: AgentDecider;
  logger: RunLogger;
  mode: RunMode;
};

// Builds everything needed to run a season: cast, RNG, decider (Random or key-gated Haiku),
// and the per-run logger. Shared by the streaming route handler so generation logic lives once.
export function prepareSeason(seed: number, useHaiku: boolean): SeasonContext {
  const safeSeed = Number.isInteger(seed) && seed > 0 ? seed : Date.now();
  const rng = createRng(safeSeed);
  const state0 = existsSync(DEFAULT_CAST_PATH)
    ? createInitialStateFromCast(safeSeed, loadGeneratedCast(DEFAULT_CAST_PATH).houseguests)
    : createInitialState(safeSeed, rng);

  const logger = createRunLogger();
  let decider: AgentDecider;
  if (useHaiku) {
    loadRootEnv();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured, so AI houseguests are unavailable. Add it to .env or turn off AI mode.",
      );
    }
    decider = new HaikuDecider(new AnthropicToolCaller(logger.agentCall));
  } else {
    decider = new RandomDecider(rng);
  }

  const mode: RunMode = useHaiku ? "haiku" : "random";
  const savedAt = new Date().toISOString();
  const id = `run-${savedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${safeSeed}-${useHaiku ? "ai" : "r"}`;
  return { id, savedAt, seed: safeSeed, rng, state0, decider, logger, mode };
}

// Persists a run snapshot (tape + debug log) under the context's stable id. Called repeatedly
// as checkpoints during generation (complete=false) and once at the end (complete=true), so an
// interrupted run is never lost.
export function persistRun(ctx: SeasonContext, tape: SeasonTape, complete: boolean): RunMeta {
  return saveRun({ id: ctx.id, tape, mode: ctx.mode, savedAt: ctx.savedAt, log: ctx.logger.entries(), complete });
}
