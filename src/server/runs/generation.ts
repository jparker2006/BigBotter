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
import { createRunLogger, type LogEntry, type RunLogger } from "./runLogger";
import { saveRun, type RunMeta, type RunMode } from "./runStore";

const DEFAULT_CAST_PATH = "data/casts/m2-cast-001.json";

export type SeasonContext = {
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

  return { seed: safeSeed, rng, state0, decider, logger, mode: useHaiku ? "haiku" : "random" };
}

// Persists a finished season (tape + debug log) and returns its listable summary.
export function finalizeRun(params: { tape: SeasonTape; mode: RunMode; log: LogEntry[] }): RunMeta {
  const savedAt = new Date().toISOString();
  const id = `run-${savedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${params.tape.state0.seed}-${params.mode === "haiku" ? "ai" : "r"}`;
  return saveRun({ id, tape: params.tape, mode: params.mode, savedAt, log: params.log });
}
