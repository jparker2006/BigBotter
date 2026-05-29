import { activeHouseguests, getHouseguest } from "../../engine/selectors";
import type { GameState } from "../../engine/types";

function houseguestLine(state: GameState, id: string): string {
  const houseguest = getHouseguest(state, id);
  return [
    `${houseguest.id}: ${houseguest.name}`,
    `${houseguest.age}`,
    houseguest.occupation,
    houseguest.hometown,
    `archetype=${houseguest.archetype}`,
    `morale=${houseguest.morale}`,
    `stats=${JSON.stringify(houseguest.stats)}`,
    houseguest.status !== "active" ? `status=${houseguest.status}` : null,
    houseguest.isHOH ? "HOH" : null,
    houseguest.isNominated ? "NOMINATED" : null,
    houseguest.hasVeto ? "VETO" : null,
    houseguest.isHaveNot ? "HAVE-NOT" : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function decisionStateSummary(state: GameState): string {
  const active = activeHouseguests(state);
  return [
    `Season ${state.seasonId}, week ${state.week}, phase ${state.phase}.`,
    `Active count: ${active.length}. Jury: ${state.juryIds.join(", ") || "none"}.`,
    `HOH: ${state.hohId ?? "none"}. Nominees: ${state.nomineeIds.join(", ") || "none"}. Veto holder: ${
      state.vetoHolderId ?? "none"
    }.`,
    `Active houseguests:\n${active.map((houseguest) => houseguestLine(state, houseguest.id)).join("\n")}`,
  ].join("\n");
}

export function actorPersona(state: GameState, actorId: string): string {
  const actor = getHouseguest(state, actorId);
  return [
    `${actor.name} (${actor.id})`,
    `Bio: ${actor.bio}`,
    `Personality: ${actor.personality}`,
    `Talking style: ${actor.talkingStyle}`,
    `Archetype: ${actor.archetype}`,
    `Stats: ${JSON.stringify(actor.stats)}`,
    `Morale: ${actor.morale}`,
  ].join("\n");
}

export function legalIdList(state: GameState, legalIds: readonly string[]): string {
  return legalIds.map((id) => `${id}: ${getHouseguest(state, id).name}`).join("\n");
}

