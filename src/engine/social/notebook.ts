import type {
  Alliance,
  Deal,
  GameState,
  Grudge,
  Houseguest,
  Memory,
  Notebook,
  Relationship,
} from "../types";
import type { AllianceProposal, DealProposal, RelationshipDelta, SocialTurn } from "../agents/decider";
import { activeHouseguests, getHouseguest } from "../selectors";

function clampTrust(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

function clampMagnitude(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function emptyNotebook(): Notebook {
  return {
    relationships: {},
    allianceIds: [],
    targetIds: [],
    deals: [],
    secretsKnown: [],
    reads: [],
    grudges: [],
    memoryLog: [],
  };
}

function defaultRelationship(target: Houseguest): Relationship {
  return {
    targetId: target.id,
    trust: 0,
    sentiment: "unproven",
    isShowmance: false,
    notes: "",
  };
}

export function ensureNotebook(state: GameState, houseguestId: string): Notebook {
  const houseguest = getHouseguest(state, houseguestId);
  houseguest.notebook ??= emptyNotebook();
  for (const other of state.houseguests) {
    if (other.id !== houseguestId && !houseguest.notebook.relationships[other.id]) {
      houseguest.notebook.relationships[other.id] = defaultRelationship(other);
    }
  }
  return houseguest.notebook;
}

export function ensureAllNotebooks(state: GameState): void {
  for (const houseguest of state.houseguests) {
    ensureNotebook(state, houseguest.id);
  }
}

export function addMemory(state: GameState, witnessId: string, memory: Memory): void {
  const notebook = ensureNotebook(state, witnessId);
  notebook.memoryLog.push({
    what: memory.what,
    magnitude: clampMagnitude(memory.magnitude),
    week: memory.week,
  });
  notebook.memoryLog.sort((a, b) => b.magnitude - a.magnitude || b.week - a.week);
  notebook.memoryLog = notebook.memoryLog.slice(0, 60);
}

export function rememberMany(state: GameState, witnessIds: readonly string[], what: string, magnitude: number): void {
  for (const witnessId of new Set(witnessIds)) {
    addMemory(state, witnessId, { what, magnitude, week: state.week });
  }
}

export function decayMemories(state: GameState): void {
  for (const houseguest of state.houseguests) {
    const memoryStat = houseguest.stats.memory;
    houseguest.notebook.memoryLog = houseguest.notebook.memoryLog.filter((memory) => {
      const age = Math.max(0, state.week - memory.week);
      const recallScore = memory.magnitude + memoryStat * 0.65 - age * 7;
      return memory.magnitude >= 80 || recallScore >= 38;
    });
  }
}

export function adjustRelationship(
  state: GameState,
  observerId: string,
  targetId: string,
  trustDelta: number,
  sentiment?: string,
  note?: string,
): void {
  if (observerId === targetId) {
    return;
  }
  const notebook = ensureNotebook(state, observerId);
  const relationship = notebook.relationships[targetId] ?? defaultRelationship(getHouseguest(state, targetId));
  relationship.trust = clampTrust(relationship.trust + trustDelta);
  if (sentiment) {
    relationship.sentiment = sentiment;
  }
  if (note) {
    relationship.notes = relationship.notes ? `${relationship.notes}; ${note}` : note;
  }
  notebook.relationships[targetId] = relationship;
}

export function addGrudge(state: GameState, holderId: string, grudge: Grudge): void {
  const notebook = ensureNotebook(state, holderId);
  notebook.grudges.push({ ...grudge, magnitude: clampMagnitude(grudge.magnitude) });
  notebook.grudges = notebook.grudges
    .sort((a, b) => b.magnitude - a.magnitude || b.week - a.week)
    .slice(0, 20);
}

export function addRead(state: GameState, witnessId: string, read: string): void {
  const notebook = ensureNotebook(state, witnessId);
  if (!notebook.reads.includes(read)) {
    notebook.reads.push(read);
  }
  notebook.reads = notebook.reads.slice(-30);
}

export function addSecret(state: GameState, witnessId: string, secret: string): void {
  const notebook = ensureNotebook(state, witnessId);
  if (!notebook.secretsKnown.includes(secret)) {
    notebook.secretsKnown.push(secret);
  }
  notebook.secretsKnown = notebook.secretsKnown.slice(-30);
}

function nextId(prefix: string, existingCount: number, week: number): string {
  return `${prefix}-w${week}-${String(existingCount + 1).padStart(2, "0")}`;
}

export function createAlliance(
  state: GameState,
  proposal: AllianceProposal,
  witnessIds: readonly string[],
): Alliance | null {
  const memberIds = [...new Set(proposal.memberIds)].filter((id) => getHouseguest(state, id).status === "active");
  if (memberIds.length < 2) {
    return null;
  }

  const existing = state.alliances.find(
    (alliance) =>
      alliance.isActive &&
      alliance.memberIds.length === memberIds.length &&
      alliance.memberIds.every((id) => memberIds.includes(id)),
  );
  if (existing) {
    return existing;
  }

  const alliance: Alliance = {
    id: nextId("alliance", state.alliances.length, state.week),
    name: proposal.name.trim().slice(0, 48) || `Week ${state.week} Pact`,
    memberIds,
    formedWeek: state.week,
    isActive: true,
    secret: proposal.secret ?? true,
  };
  state.alliances.push(alliance);

  for (const memberId of memberIds) {
    const notebook = ensureNotebook(state, memberId);
    if (!notebook.allianceIds.includes(alliance.id)) {
      notebook.allianceIds.push(alliance.id);
    }
    addMemory(state, memberId, {
      week: state.week,
      magnitude: 70,
      what: `Formed alliance "${alliance.name}" with ${memberIds.filter((id) => id !== memberId).join(", ")}.`,
    });
  }

  for (const witnessId of witnessIds) {
    if (!memberIds.includes(witnessId)) {
      addSecret(state, witnessId, `Overheard alliance "${alliance.name}" includes ${memberIds.join(", ")}.`);
      addMemory(state, witnessId, {
        week: state.week,
        magnitude: 55,
        what: `Overheard alliance "${alliance.name}" being discussed.`,
      });
    }
  }

  return alliance;
}

export function createDeal(state: GameState, proposal: DealProposal, witnessIds: readonly string[]): Deal | null {
  const partyIds = [...new Set(proposal.partyIds)].filter((id) => getHouseguest(state, id).status === "active");
  if (partyIds.length < 2) {
    return null;
  }

  const deal: Deal = {
    id: nextId("deal", state.houseguests.reduce((sum, hg) => sum + hg.notebook.deals.length, 0), state.week),
    partyIds,
    terms: proposal.terms.trim().slice(0, 180) || "Mutual safety this week.",
    week: state.week,
    status: "active",
  };

  for (const partyId of partyIds) {
    const notebook = ensureNotebook(state, partyId);
    notebook.deals.push(structuredClone(deal));
    addMemory(state, partyId, {
      week: state.week,
      magnitude: 62,
      what: `Made deal "${deal.terms}" with ${partyIds.filter((id) => id !== partyId).join(", ")}.`,
    });
  }

  for (const witnessId of witnessIds) {
    if (!partyIds.includes(witnessId)) {
      addSecret(state, witnessId, `Overheard deal "${deal.terms}" between ${partyIds.join(", ")}.`);
    }
  }

  return deal;
}

function applyRelationshipDeltas(
  state: GameState,
  speakerId: string,
  deltas: readonly RelationshipDelta[] | undefined,
): void {
  for (const delta of deltas ?? []) {
    if (!state.houseguests.some((houseguest) => houseguest.id === delta.targetId)) {
      continue;
    }
    adjustRelationship(state, speakerId, delta.targetId, delta.trustDelta, delta.sentiment, delta.note);
    if (delta.grudgeMagnitude && delta.grudgeMagnitude > 0) {
      addGrudge(state, speakerId, {
        againstId: delta.targetId,
        what: delta.note ?? "Social slight",
        magnitude: delta.grudgeMagnitude,
        week: state.week,
      });
    }
  }
}

export function applySocialTurn(
  state: GameState,
  speakerId: string,
  participantIds: readonly string[],
  witnessIds: readonly string[],
  turn: SocialTurn,
): { allianceIds: string[]; dealIds: string[]; showmanceIds: string[] } {
  const allWitnesses = [...new Set([...participantIds, ...witnessIds])];
  const allianceIds: string[] = [];
  const dealIds: string[] = [];
  const showmanceIds: string[] = [];

  rememberMany(state, allWitnesses, `${getHouseguest(state, speakerId).name} said: ${turn.text}`, 18);
  applyRelationshipDeltas(state, speakerId, turn.relationshipDeltas);

  for (const memory of turn.memories ?? []) {
    rememberMany(state, memory.witnessIds ?? allWitnesses, memory.what, memory.magnitude);
  }

  for (const secret of turn.secretsShared ?? []) {
    for (const witnessId of allWitnesses) {
      if (witnessId !== speakerId) {
        addSecret(state, witnessId, secret);
      }
    }
  }

  for (const read of turn.readsShared ?? []) {
    for (const witnessId of allWitnesses) {
      if (witnessId !== speakerId) {
        addRead(state, witnessId, read);
      }
    }
  }

  if (turn.allianceProposal) {
    const alliance = createAlliance(state, turn.allianceProposal, witnessIds);
    if (alliance) {
      allianceIds.push(alliance.id);
    }
  }

  if (turn.dealProposal) {
    const deal = createDeal(state, turn.dealProposal, witnessIds);
    if (deal) {
      dealIds.push(deal.id);
    }
  }

  if (turn.showmanceTargetId && participantIds.includes(turn.showmanceTargetId)) {
    const speakerRelationship = ensureNotebook(state, speakerId).relationships[turn.showmanceTargetId];
    const targetRelationship = ensureNotebook(state, turn.showmanceTargetId).relationships[speakerId];
    speakerRelationship.isShowmance = true;
    targetRelationship.isShowmance = true;
    speakerRelationship.trust = Math.max(speakerRelationship.trust, 75);
    targetRelationship.trust = Math.max(targetRelationship.trust, 75);
    showmanceIds.push([speakerId, turn.showmanceTargetId].sort().join(":"));
    rememberMany(
      state,
      [speakerId, turn.showmanceTargetId],
      `${getHouseguest(state, speakerId).name} and ${getHouseguest(state, turn.showmanceTargetId).name} became a showmance.`,
      78,
    );
  }

  return { allianceIds, dealIds, showmanceIds };
}

function breakDealFor(
  state: GameState,
  breakerId: string,
  harmedId: string,
  what: string,
  magnitude: number,
  revealed: boolean,
): void {
  const breakerNotebook = ensureNotebook(state, breakerId);
  const harmedNotebook = ensureNotebook(state, harmedId);
  const activeDeals = harmedNotebook.deals.filter(
    (deal) => deal.status === "active" && deal.partyIds.includes(breakerId) && deal.partyIds.includes(harmedId),
  );

  for (const deal of activeDeals) {
    deal.status = "broken";
    const breakerDeal = breakerNotebook.deals.find((candidate) => candidate.id === deal.id);
    if (breakerDeal) {
      breakerDeal.status = "broken";
    }
    if (revealed) {
      addGrudge(state, harmedId, {
        againstId: breakerId,
        what: `${what}; broke deal "${deal.terms}"`,
        magnitude,
        week: state.week,
      });
      adjustRelationship(state, harmedId, breakerId, -Math.round(magnitude / 2), "betrayed", what);
    }
  }
}

export function recordNominationConsequences(state: GameState, hohId: string, nomineeIds: readonly string[]): void {
  for (const nomineeId of nomineeIds) {
    adjustRelationship(state, nomineeId, hohId, -24, "betrayed", "put me on the block");
    addGrudge(state, nomineeId, {
      againstId: hohId,
      what: "Nominated me for eviction",
      magnitude: 64,
      week: state.week,
    });
    breakDealFor(state, hohId, nomineeId, "Nominated a deal partner", 72, true);
  }

  for (const alliance of state.alliances.filter((candidate) => candidate.isActive && candidate.memberIds.includes(hohId))) {
    for (const nomineeId of nomineeIds) {
      if (alliance.memberIds.includes(nomineeId)) {
        addGrudge(state, nomineeId, {
          againstId: hohId,
          what: `Nominated me despite alliance "${alliance.name}"`,
          magnitude: 82,
          week: state.week,
        });
      }
    }
  }
}

export function recordVoteConsequences(state: GameState, voterId: string, targetId: string, revealed: boolean): void {
  breakDealFor(state, voterId, targetId, "Voted to evict a deal partner", 68, revealed);
  for (const alliance of state.alliances.filter((candidate) => candidate.isActive && candidate.memberIds.includes(voterId))) {
    if (alliance.memberIds.includes(targetId)) {
      if (revealed) {
        addGrudge(state, targetId, {
          againstId: voterId,
          what: `Voted against alliance member in "${alliance.name}"`,
          magnitude: 74,
          week: state.week,
        });
      }
      addMemory(state, voterId, {
        what: `Secretly voted against alliance member ${targetId} in "${alliance.name}".`,
        magnitude: 55,
        week: state.week,
      });
    }
  }
}

export function activeTargetsFromNotebook(state: GameState, actorId: string): string[] {
  const notebook = ensureNotebook(state, actorId);
  return activeHouseguests(state)
    .filter((houseguest) => houseguest.id !== actorId)
    .map((houseguest) => ({
      id: houseguest.id,
      trust: notebook.relationships[houseguest.id]?.trust ?? 0,
      target: notebook.targetIds.includes(houseguest.id),
    }))
    .sort((a, b) => Number(b.target) - Number(a.target) || a.trust - b.trust)
    .map((candidate) => candidate.id);
}
