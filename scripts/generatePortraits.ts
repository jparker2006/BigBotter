import { generatePortraitsForCast } from "../src/server/google/portraits";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const castPath = argValue("cast");
  if (!castPath) {
    throw new Error("Usage: pnpm generate:portraits -- --cast=data/casts/<season-id>.json");
  }
  const result = await generatePortraitsForCast({
    castPath,
    overwrite: process.argv.includes("--overwrite"),
  });
  console.log(`Portrait generation complete for ${result.castPath}`);
  console.log(`Generated: ${result.generated}; skipped: ${result.skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

