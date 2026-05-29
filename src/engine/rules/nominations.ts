import { MORALE } from "../constants";
import { applyMoraleDelta } from "../morale";
import { activeIds, getHouseguest } from "../selectors";
import type { GameState } from "../types";

export function legalNominees(state: GameState): string[] {
  if (!state.hohId) {
    return [];
  }
  return activeIds(state).filter((id) => id !== state.hohId);
}

export function validateNominations(state: GameState, nomineeIds: readonly string[]): string[] | null {
  const legal = legalNominees(state);
  const unique = [...new Set(nomineeIds)];
  if (unique.length !== 2) {
    return null;
  }
  return unique.every((id) => legal.includes(id)) ? unique : null;
}

export function applyNominations(state: GameState, nomineeIds: readonly string[]): void {
  const validated = validateNominations(state, nomineeIds);
  if (!validated) {
    throw new Error(`Illegal nominations: ${nomineeIds.join(", ")}`);
  }

  state.nomineeIds = [...validated];
  for (const houseguest of state.houseguests) {
    houseguest.isNominated = validated.includes(houseguest.id);
  }
  for (const id of validated) {
    applyMoraleDelta(getHouseguest(state, id), MORALE.NOMINATED);
  }
}

