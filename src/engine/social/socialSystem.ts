import type { AgentDecider, ConversationPlan, SocialIntent, SocialTurn } from "../agents/decider";
import { SOCIAL } from "../constants";
import { activeHouseguests, getHouseguest } from "../selectors";
import type { GameEvent, GameState, Phase, RoomId } from "../types";
import type { Rng } from "../rng";
import {
  activeTargetsFromNotebook,
  adjustRelationship,
  applySocialTurn,
  decayMemories,
  ensureNotebook,
  rememberMany,
} from "./notebook";

const SOCIAL_ROOMS: RoomId[] = ["hoh_room", "bedrooms", "kitchen", "living_room", "backyard", "storage"];
const PRIVATE_ROOMS: RoomId[] = ["storage", "hoh_room", "backyard", "have_not_room"];

const PHASE_INTENT: Record<Extract<Phase, "scheme_1" | "scheme_2" | "scheme_3" | "scheme_4">, SocialIntent[]> = {
  scheme_1: ["build_trust", "form_alliance", "target_threat"],
  scheme_2: ["campaign", "protect_ally", "make_deal"],
  scheme_3: ["make_deal", "protect_ally", "spread_lie"],
  scheme_4: ["campaign", "jury_management", "spread_lie"],
};

function isSchemePhase(phase: Phase): phase is Extract<Phase, "scheme_1" | "scheme_2" | "scheme_3" | "scheme_4"> {
  return phase === "scheme_1" || phase === "scheme_2" || phase === "scheme_3" || phase === "scheme_4";
}

function occupants(state: GameState, roomId: RoomId): string[] {
  return activeHouseguests(state)
    .filter((houseguest) => houseguest.location === roomId)
    .map((houseguest) => houseguest.id);
}

function legalConversationTargets(state: GameState, actorId: string, phase: Phase): string[] {
  const activeIds = activeHouseguests(state)
    .map((houseguest) => houseguest.id)
    .filter((id) => id !== actorId);

  if (phase === "scheme_4") {
    const voters = activeIds.filter((id) => id !== state.hohId && !state.nomineeIds.includes(id));
    if (state.nomineeIds.includes(actorId) && voters.length > 0) {
      return voters;
    }
  }

  if (phase === "scheme_2" && state.nomineeIds.includes(actorId) && state.hohId) {
    return [state.hohId, ...activeIds.filter((id) => id !== state.hohId)];
  }

  if (phase === "scheme_3" && state.vetoHolderId && actorId !== state.vetoHolderId) {
    return [state.vetoHolderId, ...activeIds.filter((id) => id !== state.vetoHolderId)];
  }

  return activeIds;
}

function fallbackPlan(state: GameState, rng: Rng, actorId: string, phase: Phase): ConversationPlan {
  const legalIds = legalConversationTargets(state, actorId, phase);
  const notebookTargets = activeTargetsFromNotebook(state, actorId).filter((id) => legalIds.includes(id));
  const targetId = notebookTargets[0] ?? rng.pick(legalIds);
  const canGroup = activeHouseguests(state).length > 7 && rng.next() < 0.25;
  const secondTarget =
    canGroup && legalIds.length > 1 ? rng.pick(legalIds.filter((id) => id !== targetId)) : null;
  const intent = rng.pick(PHASE_INTENT[phase as Extract<Phase, "scheme_1" | "scheme_2" | "scheme_3" | "scheme_4">]);
  return {
    participantIds: [actorId, targetId, ...(secondTarget ? [secondTarget] : [])],
    preferredRoomId: null,
    intent,
  };
}

function sanitizePlan(state: GameState, actorId: string, phase: Phase, plan: ConversationPlan): ConversationPlan | null {
  const legalIds = new Set(legalConversationTargets(state, actorId, phase));
  const participantIds = [
    actorId,
    ...plan.participantIds.filter((id) => id !== actorId && legalIds.has(id)),
  ].slice(0, 4);
  if (participantIds.length < 2) {
    return null;
  }
  const preferredRoomId = plan.preferredRoomId && SOCIAL_ROOMS.includes(plan.preferredRoomId) ? plan.preferredRoomId : null;
  return {
    participantIds,
    preferredRoomId,
    intent: PHASE_INTENT[phase as Extract<Phase, "scheme_1" | "scheme_2" | "scheme_3" | "scheme_4">].includes(plan.intent)
      ? plan.intent
      : "build_trust",
  };
}

async function getPlan(
  state: GameState,
  rng: Rng,
  decider: AgentDecider,
  actorId: string,
  phase: Phase,
): Promise<ConversationPlan | null> {
  const legalIds = legalConversationTargets(state, actorId, phase);
  if (legalIds.length === 0) {
    return null;
  }
  const fallback = fallbackPlan(state, rng, actorId, phase);
  if (!decider.planConversation) {
    return fallback;
  }

  try {
    const plan = await decider.planConversation({
      state,
      actorId,
      legalIds,
      phase,
      roomId: getHouseguest(state, actorId).location,
      reason: "scheme_conversation_plan",
    });
    return sanitizePlan(state, actorId, phase, plan) ?? fallback;
  } catch {
    return fallback;
  }
}

function blockersFor(state: GameState, actorId: string, roomId: RoomId, participantIds: readonly string[]): string[] {
  const notebook = ensureNotebook(state, actorId);
  return occupants(state, roomId).filter((id) => {
    if (participantIds.includes(id)) {
      return false;
    }
    return (notebook.relationships[id]?.trust ?? 0) <= -45;
  });
}

function chooseRoom(state: GameState, rng: Rng, actorId: string, plan: ConversationPlan): { roomId: RoomId; blockedByIds: string[] } {
  const firstTarget = plan.participantIds.find((id) => id !== actorId)!;
  const targetRoom = plan.preferredRoomId ?? getHouseguest(state, firstTarget).location;
  const blockedByIds = blockersFor(state, actorId, targetRoom, plan.participantIds);
  if (blockedByIds.length === 0) {
    return { roomId: targetRoom, blockedByIds };
  }

  const candidates = PRIVATE_ROOMS.filter((roomId) => blockersFor(state, actorId, roomId, plan.participantIds).length === 0);
  return { roomId: candidates.length > 0 ? rng.pick(candidates) : targetRoom, blockedByIds };
}

function moveToRoom(state: GameState, houseguestId: string, roomId: RoomId): GameEvent | null {
  const houseguest = getHouseguest(state, houseguestId);
  if (houseguest.location === roomId) {
    return null;
  }
  const from = houseguest.location;
  houseguest.location = roomId;
  return { t: "movement", hgId: houseguestId, from, to: roomId };
}

function defaultLine(state: GameState, rng: Rng, speakerId: string, participantIds: readonly string[], intent: SocialIntent): SocialTurn {
  const speaker = getHouseguest(state, speakerId);
  const others = participantIds.filter((id) => id !== speakerId);
  const target = getHouseguest(state, rng.pick(others));
  const opener: Record<SocialIntent, string> = {
    build_trust: "I want us comparing notes before the house gets loud.",
    campaign: "I need your vote, and I can be useful for your game next week.",
    protect_ally: "Keeping my people safe keeps a shield in front of both of us.",
    target_threat: "If we let the obvious threat slide again, we deserve what happens.",
    form_alliance: "This room could be the core if everyone keeps it quiet.",
    make_deal: "Give me safety this week and I will return it when I have power.",
    test_showmance: "I trust you more than I probably should in this house.",
    spread_lie: "I heard people saying your name, but I am not naming names yet.",
    jury_management: "Whatever happens Thursday, I want respect between us.",
  };
  const trustDelta = Math.round((speaker.stats.charisma - 50) / 18) + (intent === "spread_lie" ? -2 : 4);
  const memories = [{ what: `${speaker.name} worked on ${target.name}: ${opener[intent]}`, magnitude: 24 }];
  const allianceProposal =
    intent === "form_alliance" && participantIds.length >= 3 && rng.next() < 0.45
      ? { name: `${speaker.name.split(" ")[0]}'s Room`, memberIds: [...participantIds], secret: true }
      : null;
  const dealProposal =
    intent === "make_deal" && rng.next() < 0.5
      ? { partyIds: [speakerId, target.id], terms: `Mutual safety through Week ${state.week}.` }
      : null;
  const showmanceTargetId = intent === "test_showmance" && rng.next() < 0.35 ? target.id : null;
  const readsShared = intent === "spread_lie" ? [`${speaker.name} claims ${target.name} is being targeted.`] : [];

  return {
    text: opener[intent],
    done: rng.next() < 0.28,
    relationshipDeltas: others.map((id) => ({
      targetId: id,
      trustDelta,
      sentiment: trustDelta >= 0 ? "warming" : "skeptical",
      note: intent,
      grudgeMagnitude: trustDelta < 0 ? 18 : undefined,
    })),
    memories,
    allianceProposal,
    dealProposal,
    showmanceTargetId,
    readsShared,
  };
}

async function getTurn(
  state: GameState,
  rng: Rng,
  decider: AgentDecider,
  speakerId: string,
  phase: Phase,
  roomId: RoomId,
  participantIds: string[],
  witnessIds: string[],
  intent: SocialIntent,
  turnIndex: number,
  priorTurns: { speakerId: string; text: string }[],
): Promise<SocialTurn> {
  const fallback = defaultLine(state, rng, speakerId, participantIds, intent);
  if (!decider.speakTurn) {
    return fallback;
  }

  try {
    const turn = await decider.speakTurn({
      state,
      actorId: speakerId,
      legalIds: participantIds.filter((id) => id !== speakerId),
      reason: "scheme_conversation_turn",
      phase,
      roomId,
      participantIds,
      witnessIds,
      intent,
      turnIndex,
      priorTurns,
    });
    if (typeof turn === "string") {
      return { ...fallback, text: turn.slice(0, 500) };
    }
    return {
      ...turn,
      text: turn.text.slice(0, 500),
      relationshipDeltas: (turn.relationshipDeltas ?? []).filter((delta) => participantIds.includes(delta.targetId)),
    };
  } catch {
    return fallback;
  }
}

function selectConversationActors(state: GameState, rng: Rng, phase: Phase): string[] {
  const active = activeHouseguests(state);
  const desired = Math.max(
    1,
    Math.min(SOCIAL.MAX_CONVERSATIONS_PER_WINDOW, Math.ceil(active.length / SOCIAL.CONVERSATION_DIVISOR)),
  );
  const priority = active
    .map((houseguest) => {
      let score = rng.next();
      if (state.nomineeIds.includes(houseguest.id)) {
        score += phase === "scheme_2" || phase === "scheme_4" ? 3 : 0.5;
      }
      if (state.hohId === houseguest.id || state.vetoHolderId === houseguest.id) {
        score += 1.2;
      }
      score += (100 - houseguest.morale) / 100;
      return { id: houseguest.id, score };
    })
    .sort((a, b) => b.score - a.score);
  return priority.slice(0, desired).map((candidate) => candidate.id);
}

type ConversationSpec = {
  actorId: string;
  participantIds: string[];
  roomId: RoomId;
  witnessIds: string[];
  intent: SocialIntent;
  maxTurns: number;
  blockedByIds: string[];
};

// Runs one conversation's multi-turn dialogue and applies its notebook/alliance effects to
// state. Conversations are built with disjoint participant sets, so several can run in parallel
// without their state mutations colliding.
async function runConversation(
  state: GameState,
  deps: { rng: Rng; decider: AgentDecider },
  phase: Phase,
  spec: ConversationSpec,
): Promise<GameEvent> {
  const { participantIds, roomId, witnessIds, intent, maxTurns } = spec;
  const turns: { speakerId: string; text: string }[] = [];
  const socialChanges = { allianceIds: [] as string[], dealIds: [] as string[], showmanceIds: [] as string[] };
  let conversationHasAlliance = false;
  let conversationHasDeal = false;
  let conversationHasShowmance = false;

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
    const speakerId = participantIds[turnIndex % participantIds.length]!;
    const turn = await getTurn(state, deps.rng, deps.decider, speakerId, phase, roomId, participantIds, witnessIds, intent, turnIndex, turns);
    if (conversationHasAlliance) {
      turn.allianceProposal = null;
    }
    if (conversationHasDeal) {
      turn.dealProposal = null;
    }
    if (conversationHasShowmance) {
      turn.showmanceTargetId = null;
    }
    turns.push({ speakerId, text: turn.text });
    const applied = applySocialTurn(state, speakerId, participantIds, witnessIds, turn);
    socialChanges.allianceIds.push(...applied.allianceIds);
    socialChanges.dealIds.push(...applied.dealIds);
    socialChanges.showmanceIds.push(...applied.showmanceIds);
    conversationHasAlliance ||= applied.allianceIds.length > 0;
    conversationHasDeal ||= applied.dealIds.length > 0;
    conversationHasShowmance ||= applied.showmanceIds.length > 0;

    for (const listenerId of participantIds.filter((id) => id !== speakerId)) {
      const charismaDelta = Math.max(-4, Math.min(7, Math.round((getHouseguest(state, speakerId).stats.charisma - 45) / 16)));
      adjustRelationship(state, listenerId, speakerId, charismaDelta, charismaDelta >= 0 ? "heard out" : "not buying it", intent);
    }

    if (turn.done && turnIndex >= 1) {
      break;
    }
  }

  return {
    t: "conversation",
    week: state.week,
    phase,
    roomId,
    participantIds: [...participantIds],
    turns,
    payload: {
      intent,
      allianceIds: [...new Set(socialChanges.allianceIds)],
      dealIds: [...new Set(socialChanges.dealIds)],
      showmanceIds: [...new Set(socialChanges.showmanceIds)],
      witnessIds,
      blockedByIds: spec.blockedByIds,
    },
  };
}

export async function runSocialScheme(
  inputState: GameState,
  deps: { rng: Rng; decider: AgentDecider },
): Promise<{ state: GameState; events: GameEvent[] }> {
  const state = inputState;
  const events: GameEvent[] = [];
  if (!isSchemePhase(state.phase)) {
    return { state, events };
  }

  decayMemories(state);
  const phase = state.phase;
  const actors = selectConversationActors(state, deps.rng, phase);
  const plans = await Promise.all(actors.map((actorId) => getPlan(state, deps.rng, deps.decider, actorId, phase)));

  // Sequential setup (no dialogue calls): give each conversation a disjoint participant set,
  // pick rooms, move people, and pre-roll turn counts off the shared RNG so the parallel phase
  // below never touches it (keeps the deterministic fallback path reproducible).
  const specs: ConversationSpec[] = [];
  const assigned = new Set<string>();
  for (const [index, plan] of plans.entries()) {
    const actorId = actors[index]!;
    // Skip if this actor was already pulled into an earlier conversation — keeps every
    // conversation's participant set fully disjoint so the parallel dialogue can't collide.
    if (!plan || assigned.has(actorId)) {
      continue;
    }
    const participantIds = [actorId, ...plan.participantIds.filter((id) => id !== actorId && !assigned.has(id))];
    if (participantIds.length < 2) {
      continue;
    }
    participantIds.forEach((id) => assigned.add(id));
    const { roomId, blockedByIds } = chooseRoom(state, deps.rng, actorId, { ...plan, participantIds });
    for (const participantId of participantIds) {
      const movement = moveToRoom(state, participantId, roomId);
      if (movement) {
        events.push(movement);
      }
    }
    const witnessIds = occupants(state, roomId).filter((id) => !participantIds.includes(id));
    if (blockedByIds.length > 0) {
      rememberMany(
        state,
        participantIds,
        `${getHouseguest(state, actorId).name} pulled a conversation away from ${blockedByIds.join(", ")}.`,
        32,
      );
    }
    const maxTurns = 2 + deps.rng.int(0, SOCIAL.MAX_TURNS_PER_CONVERSATION - 2);
    specs.push({ actorId, participantIds, roomId, witnessIds, intent: plan.intent, maxTurns, blockedByIds });
  }

  // Dialogue: run conversations in parallel when the decider does real async work (Haiku), the
  // big latency win. The deterministic fallback decider stays sequential for reproducibility.
  if (typeof deps.decider.speakTurn === "function") {
    const conversationEvents = await Promise.all(specs.map((spec) => runConversation(state, deps, phase, spec)));
    events.push(...conversationEvents);
  } else {
    for (const spec of specs) {
      events.push(await runConversation(state, deps, phase, spec));
    }
  }

  return { state, events };
}
