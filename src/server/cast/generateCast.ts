import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireEnv } from "../env";
import type { GeneratedCastFile } from "./types";
import { buildCastPrompt, CAST_PROMPT_VERSION } from "./prompts";
import { parseJsonObject } from "./json";
import { normalizeCastResponse } from "./validateCast";

export const CAST_MODEL = "claude-sonnet-4-6";

function textFromMessage(message: Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

export async function generateCast(options: { seasonId?: string; manualHouseguests?: string; outDir?: string } = {}) {
  const seasonId = options.seasonId ?? `season-${Date.now()}`;
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const message = await client.messages.create({
    model: CAST_MODEL,
    max_tokens: 12000,
    temperature: 0.95,
    stream: false,
    messages: [{ role: "user", content: buildCastPrompt(options.manualHouseguests) }],
  });

  const parsed = parseJsonObject(textFromMessage(message));
  const houseguests = normalizeCastResponse(parsed);
  const castFile: GeneratedCastFile = {
    seasonId,
    generatedAt: new Date().toISOString(),
    model: CAST_MODEL,
    promptVersion: CAST_PROMPT_VERSION,
    houseguests,
  };

  const outDir = options.outDir ?? resolve(process.cwd(), "data", "casts");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${seasonId}.json`);
  writeFileSync(outPath, `${JSON.stringify(castFile, null, 2)}\n`);

  return { castFile, outPath };
}
