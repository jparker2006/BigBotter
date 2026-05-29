"use server";

import { existsSync } from "node:fs";
import OpenAI from "openai";
import type { AgentDecider } from "../engine/agents/decider";
import { RandomDecider } from "../engine/agents/randomDecider";
import { createInitialState, createInitialStateFromCast } from "../engine/houseguestFactory";
import { createRng } from "../engine/rng";
import { runSeasonWithDecider } from "../engine/season";
import type { SeasonTape } from "../engine/types";
import { AnthropicToolCaller } from "../server/agents/anthropicTool";
import { HaikuDecider } from "../server/agents/haikuDecider";
import { loadGeneratedCast } from "../server/cast/loadCast";
import { loadRootEnv } from "../server/env";
import { createRunLogger, type LogEntry } from "../server/runs/runLogger";
import { deleteRun, listRuns, loadRun, loadRunLog, saveRun, type RunMeta } from "../server/runs/runStore";

const DEFAULT_CAST_PATH = "data/casts/m2-cast-001.json";

// Generates a full season tape. With `useHaiku`, every strategic decision, confessional,
// host line, comp answer, and scheming conversation is produced by Claude Haiku (slow, many
// calls); otherwise a deterministic RandomDecider drives an instant placeholder season.
// Every run is auto-saved to runs/ (tape + debug log) so it can be re-watched (M8).
export async function generateReplayTape(seed: number, useHaiku = false): Promise<{ tape: SeasonTape; meta: RunMeta }> {
  const safeSeed = Number.isInteger(seed) && seed > 0 ? seed : Date.now();
  const rng = createRng(safeSeed);
  const state0 = existsSync(DEFAULT_CAST_PATH)
    ? createInitialStateFromCast(safeSeed, loadGeneratedCast(DEFAULT_CAST_PATH).houseguests)
    : createInitialState(safeSeed, rng);

  const logger = createRunLogger();
  let decider: AgentDecider;
  if (useHaiku) {
    loadRootEnv();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured, so AI houseguests are unavailable. Add it to .env or turn off AI mode.",
      );
    }
    decider = new HaikuDecider(new AnthropicToolCaller(logger.agentCall));
  } else {
    decider = new RandomDecider(rng);
  }

  const tape = await runSeasonWithDecider(safeSeed, state0, decider, rng, logger.transition);
  const savedAt = new Date().toISOString();
  const id = `run-${savedAt.replace(/[^0-9]/g, "").slice(0, 17)}-${safeSeed}-${useHaiku ? "ai" : "r"}`;
  const meta = saveRun({ id, tape, mode: useHaiku ? "haiku" : "random", savedAt, log: logger.entries() });
  return { tape, meta };
}

// --- Saved run persistence (M8) ---

export async function listSavedRuns(): Promise<RunMeta[]> {
  return listRuns();
}

export async function loadSavedRun(id: string): Promise<{ meta: RunMeta; tape: SeasonTape }> {
  return loadRun(id);
}

export async function deleteSavedRun(id: string): Promise<RunMeta[]> {
  return deleteRun(id);
}

export async function loadSavedRunLog(id: string): Promise<LogEntry[]> {
  return loadRunLog(id);
}

export async function narrateJulieLine(text: string): Promise<{ ok: true; audioDataUrl: string } | { ok: false; message: string }> {
  loadRootEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  const trimmed = text.trim().slice(0, 900);

  if (!trimmed) {
    return { ok: false, message: "No host line is selected." };
  }

  if (!apiKey) {
    return { ok: false, message: "OPENAI_API_KEY is not configured, so Julie TTS is disabled." };
  }

  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: `You are a polished, original reality competition host. Read this line with crisp broadcast energy, without impersonating any real person: ${trimmed}`,
    response_format: "mp3",
  });
  const audioDataUrl = `data:audio/mpeg;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  return { ok: true, audioDataUrl };
}
