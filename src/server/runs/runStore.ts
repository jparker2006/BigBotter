import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SeasonTape } from "../../engine/types";
import type { LogEntry } from "./runLogger";

const RUNS_DIR = "runs";
const LOGS_DIR = join(RUNS_DIR, "logs");
const INDEX_PATH = join(RUNS_DIR, "index.json");

export type RunMode = "random" | "haiku";

// Lightweight, listable header for a saved run (the full tape lives in <id>.json).
export type RunMeta = {
  id: string;
  savedAt: string;
  mode: RunMode;
  seed: number;
  weeks: number;
  eventCount: number;
  winnerId: string | null;
  winnerName: string | null;
  logEntries: number;
};

// Run ids are used as filenames — reject anything that could escape the runs dir.
function assertValidId(id: string): void {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Invalid run id: ${id}`);
  }
}

function readIndex(): RunMeta[] {
  if (!existsSync(INDEX_PATH)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
    return Array.isArray(parsed) ? (parsed as RunMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(metas: RunMeta[]): void {
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(metas, null, 2));
}

function summarizeTape(tape: SeasonTape): Omit<RunMeta, "id" | "savedAt" | "mode" | "logEntries"> {
  let weeks = 0;
  const juryTally = new Map<string, number>();
  for (const event of tape.events) {
    if ("week" in event && typeof event.week === "number") {
      weeks = Math.max(weeks, event.week);
    }
    if (event.t === "jury_vote") {
      juryTally.set(event.finalistId, (juryTally.get(event.finalistId) ?? 0) + 1);
    }
  }
  let winnerId: string | null = null;
  let best = -1;
  for (const [id, count] of juryTally) {
    if (count > best) {
      best = count;
      winnerId = id;
    }
  }
  const winnerName = winnerId
    ? tape.state0.houseguests.find((houseguest) => houseguest.id === winnerId)?.name ?? null
    : null;
  return { seed: tape.state0.seed, weeks, eventCount: tape.events.length, winnerId, winnerName };
}

export function saveRun(params: { id: string; tape: SeasonTape; mode: RunMode; savedAt: string; log: LogEntry[] }): RunMeta {
  const { id, tape, mode, savedAt, log } = params;
  assertValidId(id);
  mkdirSync(LOGS_DIR, { recursive: true });

  const meta: RunMeta = { id, savedAt, mode, logEntries: log.length, ...summarizeTape(tape) };
  writeFileSync(join(RUNS_DIR, `${id}.json`), JSON.stringify({ meta, tape }));
  if (log.length > 0) {
    writeFileSync(join(LOGS_DIR, `${id}.jsonl`), log.map((entry) => JSON.stringify(entry)).join("\n"));
  }

  const index = [meta, ...readIndex().filter((existing) => existing.id !== id)];
  writeIndex(index);
  return meta;
}

export function listRuns(): RunMeta[] {
  return readIndex();
}

export function loadRun(id: string): { meta: RunMeta; tape: SeasonTape } {
  assertValidId(id);
  const path = join(RUNS_DIR, `${id}.json`);
  if (!existsSync(path)) {
    throw new Error(`Run not found: ${id}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as { meta: RunMeta; tape: SeasonTape };
}

export function loadRunLog(id: string): LogEntry[] {
  assertValidId(id);
  const path = join(LOGS_DIR, `${id}.jsonl`);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry);
}

export function deleteRun(id: string): RunMeta[] {
  assertValidId(id);
  for (const path of [join(RUNS_DIR, `${id}.json`), join(LOGS_DIR, `${id}.jsonl`)]) {
    if (existsSync(path)) {
      rmSync(path);
    }
  }
  const index = readIndex().filter((meta) => meta.id !== id);
  writeIndex(index);
  return index;
}
