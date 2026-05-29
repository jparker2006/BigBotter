import { HAVE_NOT_COUNT, HAVE_NOT_PHASEOUT_SIZE, MORALE } from "../constants";
import { applyMoraleDelta } from "../morale";
import type { Rng } from "../rng";
import { activeHouseguests, getHouseguest } from "../selectors";
import type { GameState } from "../types";

export function selectHaveNots(state: GameState, rng: Rng): string[] {
  const active = activeHouseguests(state);
  if (active.length <= HAVE_NOT_PHASEOUT_SIZE) {
    return [];
  }
  const eligible = active.filter((houseguest) => houseguest.id !== state.hohId);
  return rng.shuffle(eligible).slice(0, Math.min(HAVE_NOT_COUNT, eligible.length)).map((houseguest) => houseguest.id);
}

export function applyHaveNots(state: GameState, haveNotIds: readonly string[]): void {
  state.haveNotIds = [...haveNotIds];
  state.haveNotMoraleDeltas = {};
  for (const id of haveNotIds) {
    const houseguest = getHouseguest(state, id);
    houseguest.isHaveNot = true;
    state.haveNotMoraleDeltas[id] = applyMoraleDelta(houseguest, MORALE.HAVE_NOT);
    houseguest.location = "have_not_room";
  }
}

export function clearHaveNot(state: GameState, id: string): void {
  if (!state.haveNotIds.includes(id)) {
    return;
  }
  const houseguest = getHouseguest(state, id);
  applyMoraleDelta(houseguest, -(state.haveNotMoraleDeltas[id] ?? 0));
  houseguest.isHaveNot = false;
  state.haveNotIds = state.haveNotIds.filter((candidate) => candidate !== id);
  delete state.haveNotMoraleDeltas[id];
}

export function expireHaveNots(state: GameState): void {
  for (const id of [...state.haveNotIds]) {
    clearHaveNot(state, id);
  }
  state.haveNotMoraleDeltas = {};
}

