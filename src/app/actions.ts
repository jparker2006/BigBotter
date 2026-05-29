"use server";

import OpenAI from "openai";
import type { SeasonTape } from "../engine/types";
import { loadRootEnv } from "../server/env";
import type { LogEntry } from "../server/runs/runLogger";
import { deleteRun, listRuns, loadRun, loadRunLog, type RunMeta } from "../server/runs/runStore";

// Season generation streams via the /api/generate route handler (see ReplayPlayer) so the
// viewer can start watching week 1 while the rest generates. These actions cover the rest of
// the saved-run lifecycle (M8 persistence) and Julie TTS.

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
