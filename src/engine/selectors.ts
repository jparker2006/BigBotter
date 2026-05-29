import type { GameState, Houseguest } from "./types";

export function activeHouseguests(state: GameState): Houseguest[] {
  return state.houseguests.filter((houseguest) => houseguest.status === "active");
}

export function getHouseguest(state: GameState, id: string): Houseguest {
  const houseguest = state.houseguests.find((candidate) => candidate.id === id);
  if (!houseguest) {
    throw new Error(`Unknown houseguest: ${id}`);
  }
  return houseguest;
}

export function activeIds(state: GameState): string[] {
  return activeHouseguests(state).map((houseguest) => houseguest.id);
}

