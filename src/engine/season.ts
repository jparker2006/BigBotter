import { RandomDecider } from "./agents/randomDecider";
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
  const tape = new TapeWriter(state0);
  const decider = new RandomDecider(rng);
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
