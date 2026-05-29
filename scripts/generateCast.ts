import { generateCast } from "../src/server/cast/generateCast";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const seasonId = argValue("season-id");
  const { castFile, outPath } = await generateCast({ seasonId });
  console.log(`Generated ${castFile.houseguests.length} houseguests.`);
  console.log(`Cast saved to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

