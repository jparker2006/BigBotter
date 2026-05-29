import { existsSync } from "node:fs";
import { createInitialStateFromCast } from "../src/engine/houseguestFactory";
import { createRng } from "../src/engine/rng";
import { runSeasonWithDecider } from "../src/engine/season";
import { renderConsoleTape } from "../src/render/consoleRenderer";
import { HaikuDecider } from "../src/server/agents/haikuDecider";
import { loadGeneratedCast } from "../src/server/cast/loadCast";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const seedArg = argValue("seed");
  const seed = seedArg ? Number(seedArg) : Date.now();
  if (!Number.isInteger(seed)) {
    throw new Error(`Invalid seed: ${seedArg}`);
  }

  const castPath = argValue("cast") ?? "data/casts/m2-cast-001.json";
  if (!existsSync(castPath)) {
    throw new Error(`Missing cast file: ${castPath}. Generate one with pnpm generate:cast first.`);
  }

  const rng = createRng(seed);
  const state0 = createInitialStateFromCast(seed, loadGeneratedCast(castPath).houseguests);
  const tape = await runSeasonWithDecider(seed, state0, new HaikuDecider(), rng);
  for (const line of renderConsoleTape(tape)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

