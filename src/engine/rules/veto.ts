import { MORALE } from "../constants";
import { applyMoraleDelta } from "../morale";
import { activeIds, getHouseguest } from "../selectors";
import type { GameState } from "../types";

export type VetoUseDecision = {
  use: boolean;
  savedNomineeId: string | null;
};

export function legalVetoSaves(state: GameState): string[] {
  if (!state.vetoHolderId) {
    return [];
  }
  return [...state.nomineeIds];
}

export function validateVetoUse(state: GameState, decision: VetoUseDecision): VetoUseDecision | null {
  if (!decision.use) {
    return { use: false, savedNomineeId: null };
  }
  if (!decision.savedNomineeId || !legalVetoSaves(state).includes(decision.savedNomineeId)) {
    return null;
  }
  if (legalReplacementNominees(state, decision.savedNomineeId).length === 0) {
    return null;
  }
  return { use: true, savedNomineeId: decision.savedNomineeId };
}

export function legalReplacementNominees(state: GameState, savedNomineeId: string): string[] {
  if (!state.hohId || !state.vetoHolderId) {
    return [];
  }
  const remainingNominee = state.nomineeIds.find((id) => id !== savedNomineeId);
  return activeIds(state).filter((id) => {
    return (
      id !== state.hohId &&
      id !== state.vetoHolderId &&
      id !== savedNomineeId &&
      id !== remainingNominee
    );
  });
}

export function applyVetoUse(state: GameState, decision: VetoUseDecision, replacementNomId: string | null): void {
  const validated = validateVetoUse(state, decision);
  if (!validated) {
    throw new Error("Illegal veto use.");
  }

  state.replacementNomId = null;

  if (!validated.use || !validated.savedNomineeId) {
    return;
  }

  const legalReplacements = legalReplacementNominees(state, validated.savedNomineeId);
  if (!replacementNomId || !legalReplacements.includes(replacementNomId)) {
    throw new Error(`Illegal replacement nominee: ${replacementNomId ?? "none"}`);
  }

  const savedId = validated.savedNomineeId;
  state.nomineeIds = state.nomineeIds.filter((id) => id !== savedId);
  state.nomineeIds.push(replacementNomId);
  state.replacementNomId = replacementNomId;

  getHouseguest(state, savedId).isNominated = false;
  getHouseguest(state, replacementNomId).isNominated = true;
  applyMoraleDelta(getHouseguest(state, savedId), MORALE.SAVED_BY_VETO);
  applyMoraleDelta(getHouseguest(state, replacementNomId), MORALE.NOMINATED);
}

