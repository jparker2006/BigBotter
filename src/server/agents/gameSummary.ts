import { activeHouseguests, getHouseguest } from "../../engine/selectors";
import type { Alliance, GameState } from "../../engine/types";

// Compact roster line for in-game prompts: archetype + morale + role flags are what matter
// strategically. Cosmetic bio fields (age/occupation/hometown) are omitted to cut tokens — the
// actor's own full bio still ships via actorPersona.
function houseguestLine(state: GameState, id: string): string {
  const houseguest = getHouseguest(state, id);
  return [
    `${houseguest.id}: ${houseguest.name}`,
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

// One-line situational context (no roster, no notebook) for cheap flavor calls.
export function compactState(state: GameState): string {
  const nameOf = (id: string | null) => (id ? getHouseguest(state, id).name : "none");
  const noms = state.nomineeIds.map((id) => getHouseguest(state, id).name).join(", ") || "none";
  return `Week ${state.week}, ${state.phase}. ${activeHouseguests(state).length} houseguests left. HOH: ${nameOf(
    state.hohId,
  )}. Nominees: ${noms}. Veto holder: ${nameOf(state.vetoHolderId)}.`;
}

// Just the juicy strategic bits of a notebook (targets, alliances, top reads, grudges) — keeps
// confessionals personal without shipping the whole relationship table on every call.
export function compactNotebook(state: GameState, actorId: string): string {
  const nb = getHouseguest(state, actorId).notebook;
  const targets = nb.targetIds.map((id) => getHouseguest(state, id).name).join(", ");
  const alliances = nb.allianceIds
    .map((id) => state.alliances.find((alliance) => alliance.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const reads = Object.values(nb.relationships)
    .filter((relationship) => relationship.trust !== 0 || relationship.isShowmance)
    .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust))
    .slice(0, 4)
    .map((r) => `${getHouseguest(state, r.targetId).name} (${r.trust > 0 ? "+" : ""}${r.trust}${r.isShowmance ? ", showmance" : ""})`)
    .join(", ");
  const grudges = [...nb.grudges]
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 2)
    .map((g) => `${getHouseguest(state, g.againstId).name}: ${g.what}`)
    .join("; ");
  const lines = [
    targets ? `Your targets: ${targets}` : null,
    alliances ? `Your alliances: ${alliances}` : null,
    reads ? `Key reads: ${reads}` : null,
    grudges ? `Grudges: ${grudges}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "No strong reads or grudges yet.";
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
    // Drop zero-signal entries (default trust 0, unproven, no notes) — they're pure prompt filler.
    .filter((relationship) => relationship.trust !== 0 || relationship.isShowmance || Boolean(relationship.notes))
    .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust))
    .slice(0, 8)
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
