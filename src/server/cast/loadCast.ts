import { readFileSync } from "node:fs";
import type { GeneratedCastFile } from "./types";
import { normalizeCastResponse } from "./validateCast";

export function loadGeneratedCast(path: string): GeneratedCastFile {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as GeneratedCastFile;
  return {
    ...parsed,
    houseguests: normalizeCastResponse({ houseguests: parsed.houseguests }),
  };
}

