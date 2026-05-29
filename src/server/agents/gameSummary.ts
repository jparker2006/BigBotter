import { activeHouseguests, getHouseguest } from "../../engine/selectors";
import type { Alliance, GameState } from "../../engine/types";

function houseguestLine(state: GameState, id: string): string {
  const houseguest = getHouseguest(state, id);
  return [
    `${houseguest.id}: ${houseguest.name}`,
    `${houseguest.age}`,
    houseguest.occupation,
    houseguest.hometown,
    `archetype=${houseguest.archetype}`,
    `morale=${houseguest.morale}`,
    houseguest.status !== "active" ? `status=${houseguest.status}` : null,
    houseguest.isHOH ? "HOH" : null,
    houseguest.isNominated ? "NOMINATED" : null,
    houseguest.hasVeto ? "VETO" : null,
    houseguest.isHaveNot ? "HAVE-NOT" : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function decisionStateSummary(state: GameState, actorId?: string): string {
  const active = activeHouseguests(state);
  const actorNotebook = actorId ? privateNotebookSummary(state, actorId) : null;
  return [
    `Season ${state.seasonId}, week ${state.week}, phase ${state.phase}.`,
    `Active count: ${active.length}. Jury: ${state.juryIds.join(", ") || "none"}.`,
    `HOH: ${state.hohId ?? "none"}. Nominees: ${state.nomineeIds.join(", ") || "none"}. Veto holder: ${
      state.vetoHolderId ?? "none"
    }.`,
    `Active houseguests:\n${active.map((houseguest) => houseguestLine(state, houseguest.id)).join("\n")}`,
    actorNotebook ? `Your private notebook:\n${actorNotebook}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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

export function privateNotebookSummary(state: GameState, actorId: string): string {
  const actor = getHouseguest(state, actorId);
  const relationships = Object.values(actor.notebook.relationships)
    .filter((relationship) => state.houseguests.some((houseguest) => houseguest.id === relationship.targetId))
    .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust))
    .slice(0, 10)
    .map((relationship) => {
      const target = getHouseguest(state, relationship.targetId);
      return `${target.id}: trust=${relationship.trust}, sentiment=${relationship.sentiment}, showmance=${relationship.isShowmance}, notes=${
        relationship.notes || "none"
      }`;
    });
  const alliances = actor.notebook.allianceIds
    .map((id) => state.alliances.find((alliance) => alliance.id === id))
    .filter((alliance): alliance is Alliance => Boolean(alliance))
    .map((alliance) => `${alliance.id}: ${alliance.name} with ${alliance.memberIds.join(", ")}`);
  const deals = actor.notebook.deals
    .slice(-8)
    .map((deal) => `${deal.id}: ${deal.status} "${deal.terms}" with ${deal.partyIds.join(", ")}`);
  const grudges = actor.notebook.grudges
    .slice(0, 8)
    .map((grudge) => `${grudge.againstId}: ${grudge.what} (${grudge.magnitude})`);
  const memories = actor.notebook.memoryLog.slice(0, 10).map((memory) => `${memory.week}/${memory.magnitude}: ${memory.what}`);
  return [
    `Relationships:\n${relationships.join("\n") || "none"}`,
    `Alliances you know you're in:\n${alliances.join("\n") || "none"}`,
    `Deals you know:\n${deals.join("\n") || "none"}`,
    `Secrets known:\n${actor.notebook.secretsKnown.slice(-10).join("\n") || "none"}`,
    `Reads/suspicions:\n${actor.notebook.reads.slice(-10).join("\n") || "none"}`,
    `Grudges:\n${grudges.join("\n") || "none"}`,
    `Memories:\n${memories.join("\n") || "none"}`,
  ].join("\n");
}
