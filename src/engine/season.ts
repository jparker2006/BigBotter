import { RandomDecider } from "./agents/randomDecider";
import type { AgentDecider } from "./agents/decider";
import { createInitialState } from "./houseguestFactory";
import { createRng } from "./rng";
import { step } from "./stepper";
import { TapeWriter } from "./tape";
import type { SeasonTape } from "./types";
import type { GameState } from "./types";

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
    const result = await step(state, { rng, decider });
    state = result.state;
    done = result.done;
    tape.appendMany(result.events);
  }

  return tape.build();
}
