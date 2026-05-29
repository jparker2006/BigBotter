import { runSeason, runSeasonFromState } from "../src/engine/season";
import { createInitialStateFromCast } from "../src/engine/houseguestFactory";
import { createRng } from "../src/engine/rng";
import { renderConsoleTape } from "../src/render/consoleRenderer";
import { loadGeneratedCast } from "../src/server/cast/loadCast";

const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.slice("--seed=".length)) : Date.now();
const castArg = process.argv.find((arg) => arg.startsWith("--cast="));
const castPath = castArg?.slice("--cast=".length);

if (!Number.isInteger(seed)) {
  throw new Error(`Invalid seed: ${seedArg}`);
}

async function main() {
  const tape = castPath
    ? await runSeasonFromState(seed, createInitialStateFromCast(seed, loadGeneratedCast(castPath).houseguests), createRng(seed))
    : await runSeason(seed);
  for (const line of renderConsoleTape(tape)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
