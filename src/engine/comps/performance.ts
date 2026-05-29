import { moraleMultiplier } from "../morale";
import type { Rng } from "../rng";
import type { Houseguest } from "../types";
import { CompType, type StatWeights } from "./compCatalog";

export function scorePerformance(houseguest: Houseguest, weights: StatWeights, rng: Rng, compType?: CompType): number {
  const weightEntries = Object.entries(weights) as [keyof typeof houseguest.stats, number][];
  const totalWeight = weightEntries.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = weightEntries.reduce((sum, [stat, weight]) => sum + houseguest.stats[stat] * weight, 0);
  const base = compType === CompType.Crapshoot ? 50 + houseguest.stats.luck * 0.25 : weighted + (1 - totalWeight) * 50;
  const luckNudge = 1 + (houseguest.stats.luck - 50) / 500;
  const noiseWidth = compType === CompType.Crapshoot ? 0.85 : 0.35;
  const noise = 1 + rng.nextFloat(-noiseWidth, noiseWidth);
  return Number((base * moraleMultiplier(houseguest.morale) * luckNudge * noise).toFixed(3));
}

