import type { Houseguest } from "../../engine/types";

export type GeneratedCastFile = {
  seasonId: string;
  generatedAt: string;
  model: string;
  promptVersion: number;
  houseguests: Houseguest[];
};

