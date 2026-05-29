import { GoogleGenAI, PersonGeneration } from "@google/genai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { loadRootEnv, requireEnv } from "../env";
import type { GeneratedCastFile } from "../cast/types";

export const PORTRAIT_MODEL = "imagen-4.0-generate-001";

function googleApiKey(): string {
  loadRootEnv();
  return process.env.GOOGLE_API_KEY || requireEnv("GEMINI_API_KEY");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function portraitPrompt(houseguest: GeneratedCastFile["houseguests"][number]): string {
  return `Photorealistic studio portrait of an original fictional adult Big Brother houseguest.

Name: ${houseguest.name}
Age: ${houseguest.age}
Occupation: ${houseguest.occupation}
Hometown: ${houseguest.hometown}
Personality: ${houseguest.personality}
Archetype: ${houseguest.archetype}
Bio: ${houseguest.bio}

Style requirements:
- Original fictional person, not a celebrity or public figure.
- Waist-up reality TV cast portrait, direct eye contact, confident expression.
- Bright polished CBS-style promo lighting, clean saturated background, sharp focus.
- No text, no logos, no watermark-like text, no brand marks.
- Adult only.`;
}

function publicPortraitUrl(seasonId: string, filename: string): string {
  return `/generated/portraits/${seasonId}/${filename}`;
}

export async function generatePortraitsForCast(options: {
  castPath: string;
  outRoot?: string;
  overwrite?: boolean;
}): Promise<{ castPath: string; generated: number; skipped: number }> {
  const castFile = JSON.parse(readFileSync(options.castPath, "utf8")) as GeneratedCastFile;
  const outRoot = options.outRoot ?? resolve(process.cwd(), "public", "generated", "portraits");
  const seasonOutDir = resolve(outRoot, castFile.seasonId);
  mkdirSync(seasonOutDir, { recursive: true });

  const ai = new GoogleGenAI({ apiKey: googleApiKey() });
  let generated = 0;
  let skipped = 0;

  for (const houseguest of castFile.houseguests) {
    const filename = `${houseguest.id}-${slugify(houseguest.name)}.png`;
    const outPath = resolve(seasonOutDir, filename);
    if (existsSync(outPath) && !options.overwrite) {
      houseguest.portraitUrl = publicPortraitUrl(castFile.seasonId, basename(outPath));
      skipped += 1;
      continue;
    }

    const response = await ai.models.generateImages({
      model: PORTRAIT_MODEL,
      prompt: portraitPrompt(houseguest),
      config: {
        numberOfImages: 1,
        aspectRatio: "3:4",
        personGeneration: PersonGeneration.ALLOW_ADULT,
      },
    });

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      throw new Error(`Google image generation returned no image for ${houseguest.name}.`);
    }

    writeFileSync(outPath, Buffer.from(imageBytes, "base64"));
    houseguest.portraitUrl = publicPortraitUrl(castFile.seasonId, basename(outPath));
    generated += 1;
  }

  writeFileSync(options.castPath, `${JSON.stringify(castFile, null, 2)}\n`);
  return { castPath: options.castPath, generated, skipped };
}
