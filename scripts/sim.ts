import { runSeason } from "../src/engine/season";
import { renderConsoleTape } from "../src/render/consoleRenderer";

const seedArg = process.argv.find((arg) => arg.startsWith("--seed="));
const seed = seedArg ? Number(seedArg.slice("--seed=".length)) : Date.now();

if (!Number.isInteger(seed)) {
  throw new Error(`Invalid seed: ${seedArg}`);
}

async function main() {
  const tape = await runSeason(seed);
  for (const line of renderConsoleTape(tape)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
