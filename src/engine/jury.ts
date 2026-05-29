import { JURY_THRESHOLD } from "./constants";
import type { GameState } from "./types";

export function isJuror(preEvictionHouseSize: number): boolean {
  return preEvictionHouseSize <= JURY_THRESHOLD;
}

export function finalistIds(state: GameState): string[] {
  return state.houseguests.filter((houseguest) => houseguest.status === "active").map((houseguest) => houseguest.id);
}

