import { VETO_PLAYERS } from "../constants";
import type { AgentDecider } from "../agents/decider";
import type { Rng } from "../rng";
import { activeHouseguests, getHouseguest } from "../selectors";
import type { GameState } from "../types";

export function hohCompEligible(state: GameState): string[] {
  const active = activeHouseguests(state);
  if (!state.hohId || state.week === 1) {
    return active.map((houseguest) => houseguest.id);
  }
  const eligible = active.filter((houseguest) => houseguest.id !== state.hohId);
  return eligible.length > 0 ? eligible.map((houseguest) => houseguest.id) : active.map((houseguest) => houseguest.id);
}

export function evictionVoters(state: GameState): string[] {
  return activeHouseguests(state)
    .filter((houseguest) => houseguest.id !== state.hohId)
    .filter((houseguest) => !state.nomineeIds.includes(houseguest.id))
    .map((houseguest) => houseguest.id);
}

export function finalFourSoleVoter(state: GameState): string {
  const voters = evictionVoters(state);
  if (activeHouseguests(state).length !== 4 || voters.length !== 1) {
    throw new Error(`Final 4 must have exactly one sole voter; found ${voters.length}.`);
  }
  return voters[0]!;
}

export async function vetoPlayerDraw(state: GameState, rng: Rng, decider: AgentDecider): Promise<string[]> {
  if (!state.hohId || state.nomineeIds.length !== 2) {
    throw new Error("Cannot draw veto players without an HOH and two nominees.");
  }

  const active = activeHouseguests(state).map((houseguest) => houseguest.id);
  const targetSize = Math.min(VETO_PLAYERS, active.length);
  const drawn = [state.hohId, ...state.nomineeIds];
  const candidates = () => active.filter((id) => !drawn.includes(id));

  if (drawn.length < targetSize && candidates().length > 0) {
    const chooserId = rng.pick(drawn);
    const choice = await decider.pickHouseguestChoice({
      state,
      actorId: chooserId,
      legalIds: candidates(),
      reason: "houseguest_choice",
    });
    drawn.push(candidates().includes(choice) ? choice : rng.pick(candidates()));
  }

  while (drawn.length < targetSize && candidates().length > 0) {
    drawn.push(rng.pick(candidates()));
  }

  return drawn.map((id) => getHouseguest(state, id).id);
}

