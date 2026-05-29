"use server";

import { existsSync } from "node:fs";
import { createInitialStateFromCast } from "../engine/houseguestFactory";
import { createRng } from "../engine/rng";
import { runSeason, runSeasonWithDecider } from "../engine/season";
import type { SeasonTape } from "../engine/types";
import { RandomDecider } from "../engine/agents/randomDecider";
import { loadGeneratedCast } from "../server/cast/loadCast";

const DEFAULT_CAST_PATH = "data/casts/m2-cast-001.json";

export async function generateReplayTape(seed: number): Promise<SeasonTape> {
  const safeSeed = Number.isInteger(seed) && seed > 0 ? seed : Date.now();

  if (!existsSync(DEFAULT_CAST_PATH)) {
    return runSeason(safeSeed);
  }

  const rng = createRng(safeSeed);
  const state0 = createInitialStateFromCast(safeSeed, loadGeneratedCast(DEFAULT_CAST_PATH).houseguests);
  return runSeasonWithDecider(safeSeed, state0, new RandomDecider(rng), rng);
}
