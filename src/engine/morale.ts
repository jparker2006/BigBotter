import { MAX_MORALE, MIN_MORALE } from "./constants";
import type { Houseguest } from "./types";

export function clampMorale(value: number): number {
  return Math.max(MIN_MORALE, Math.min(MAX_MORALE, Math.round(value)));
}

export function applyMoraleDelta(houseguest: Houseguest, delta: number): number {
  const before = houseguest.morale;
  houseguest.morale = clampMorale(houseguest.morale + delta);
  return houseguest.morale - before;
}

export function moraleMultiplier(morale: number): number {
  return 0.6 + 0.4 * (clampMorale(morale) / 100);
}

