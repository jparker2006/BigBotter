import { RandomDecider } from "./agents/randomDecider";
import type { AgentDecider } from "./agents/decider";
import { createInitialState } from "./houseguestFactory";
import { createRng } from "./rng";
import { step } from "./stepper";
import { TapeWriter } from "./tape";
import type { SeasonTape } from "./types";
import type { GameState, Phase } from "./types";

// Emitted after each phase transition. The engine stays pure — the caller (server) decides
// whether to log it; default behaviour is a no-op.
export type StepInfo = { step: number; phase: Phase; nextPhase: Phase; week: number; events: number; done: boolean };

export async function runSeason(seed = Date.now()): Promise<SeasonTape> {
  const rng = createRng(seed);
  const state0 = createInitialState(seed, rng);
  return runSeasonFromState(seed, state0, rng);
}

export async function runSeasonFromState(seed: number, state0: GameState, rng = createRng(seed)): Promise<SeasonTape> {
  return runSeasonWithDecider(seed, state0, new RandomDecider(rng), rng);
}

export async function runSeasonWithDecider(
  _seed: number,
  state0: GameState,
  decider: AgentDecider,
  rng = createRng(state0.seed),
  onStep?: (info: StepInfo) => void,
): Promise<SeasonTape> {
  const tape = new TapeWriter(state0);
  let state = state0;
  let done = false;
  let guard = 0;

  while (!done) {
    guard += 1;
    if (guard > 500) {
      throw new Error("Season did not terminate within 500 steps.");
    }
    const phase = state.phase;
    const week = state.week;
    const result = await step(state, { rng, decider });
    state = result.state;
    done = result.done;
    tape.appendMany(result.events);
    onStep?.({ step: guard, phase, nextPhase: state.phase, week, events: result.events.length, done });
  }

  return tape.build();
}
