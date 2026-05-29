import { MORALE, DOUBLE_EVICTION_AT_HOUSE_SIZE } from "./constants";
import type { AgentDecider } from "./agents/decider";
import { withValidation } from "./agents/validateDecision";
import { pickHohComp, pickVetoComp } from "./comps/compScheduler";
import { resolveComp } from "./comps/resolveComp";
import { runFinalHoh, runFinalJuryVote } from "./endgame";
import { isJuror } from "./jury";
import { applyMoraleDelta } from "./morale";
import type { Rng } from "./rng";
import { activeHouseguests, getHouseguest } from "./selectors";
import type { GameEvent, GameState, Phase } from "./types";
import { evictionVoters, finalFourSoleVoter, hohCompEligible, vetoPlayerDraw } from "./rules/eligibility";
import { applyHaveNots, clearHaveNot, expireHaveNots, selectHaveNots } from "./rules/haveNots";
import { applyNominations, legalNominees, validateNominations } from "./rules/nominations";
import { applyVetoUse, legalReplacementNominees, validateVetoUse } from "./rules/veto";
import { evictionResultFromTally, tallyVotes, validateEvictionVote } from "./rules/votes";

export type StepDeps = { rng: Rng; decider: AgentDecider };
export type StepResult = { state: GameState; events: GameEvent[]; done: boolean };

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function clearCompetitionFlags(state: GameState): void {
  state.nomineeIds = [];
  state.vetoHolderId = null;
  state.replacementNomId = null;
  for (const houseguest of state.houseguests) {
    if (houseguest.status === "active") {
      houseguest.isHOH = false;
      houseguest.isNominated = false;
      houseguest.hasVeto = false;
    }
  }
}

function pushUsedComp(state: GameState, compType: string): void {
  state.usedCompTypes.push(compType);
}

function nextSchemePhase(phase: Phase): Phase {
  const next: Record<Phase, Phase> = {
    hoh_comp: "scheme_1",
    scheme_1: "nominations",
    nominations: "scheme_2",
    scheme_2: "veto_comp",
    veto_comp: "scheme_3",
    scheme_3: "veto_ceremony",
    veto_ceremony: "scheme_4",
    scheme_4: "eviction",
    eviction: "hoh_comp",
    final_hoh: "final_2_jury",
    final_2_jury: "final_2_jury",
  };
  return next[phase];
}

function nomineeNames(state: GameState): string {
  return state.nomineeIds.map((id) => getHouseguest(state, id).name).join(" and ");
}

async function runHohComp(state: GameState, deps: StepDeps): Promise<StepResult> {
  const events: GameEvent[] = [];
  const activeCount = activeHouseguests(state).length;
  const startingDoubleEviction =
    activeCount === DOUBLE_EVICTION_AT_HOUSE_SIZE && !state.isDoubleEviction && state.doubleEvictionRemaining === 0;

  if (startingDoubleEviction) {
    state.isDoubleEviction = true;
    state.doubleEvictionRemaining = 2;
    events.push({ t: "host", week: state.week, text: "*** DOUBLE EVICTION ***" });
  }

  const previousHohId = state.hohId;
  const eligibleIds = hohCompEligible(state);
  clearCompetitionFlags(state);
  const compType = pickHohComp(deps.rng, state.usedCompTypes, state.week, previousHohId !== null && state.isDoubleEviction);
  const players = eligibleIds.map((id) => getHouseguest(state, id));
  const resolved = resolveComp(compType, players, deps.rng);
  pushUsedComp(state, compType);

  state.hohId = resolved.winnerId;
  getHouseguest(state, resolved.winnerId).isHOH = true;
  applyMoraleDelta(getHouseguest(state, resolved.winnerId), MORALE.WIN_HOH);
  clearHaveNot(state, resolved.winnerId);

  if (state.haveNotIds.length === 0) {
    applyHaveNots(state, selectHaveNots(state, deps.rng));
  }

  events.push({ t: "comp", week: state.week, phase: "hoh_comp", ...resolved });
  events.push({
    t: "host",
    week: state.week,
    text: `Week ${state.week}: ${getHouseguest(state, resolved.winnerId).name} is HOH. Have-nots: ${
      state.haveNotIds.map((id) => getHouseguest(state, id).name).join(", ") || "none"
    }.`,
    payload: { haveNotIds: [...state.haveNotIds], previousHohId },
  });

  state.phase = "scheme_1";
  return { state, events, done: false };
}

async function runNominations(state: GameState, deps: StepDeps): Promise<StepResult> {
  const legalIds = legalNominees(state);
  const nomineeIds = await withValidation(
    () =>
      deps.decider.pickNominations({
        state,
        actorId: state.hohId!,
        legalIds,
        reason: "nominations",
      }),
    (decision) => validateNominations(state, decision),
    () => deps.rng.shuffle(legalIds).slice(0, 2),
  );
  applyNominations(state, nomineeIds);
  state.phase = "scheme_2";
  return {
    state,
    events: [
      {
        t: "ceremony",
        week: state.week,
        kind: "nomination",
        payload: { hohId: state.hohId, nomineeIds: [...state.nomineeIds] },
      },
      { t: "host", week: state.week, text: `Nominated: ${nomineeNames(state)}.` },
    ],
    done: false,
  };
}

async function runVetoComp(state: GameState, deps: StepDeps): Promise<StepResult> {
  const draw = await vetoPlayerDraw(state, deps.rng, deps.decider);
  const compType = pickVetoComp(deps.rng, state.usedCompTypes, activeHouseguests(state).length);
  const resolved = resolveComp(compType, draw.map((id) => getHouseguest(state, id)), deps.rng);
  pushUsedComp(state, compType);
  state.vetoHolderId = resolved.winnerId;
  for (const houseguest of state.houseguests) {
    houseguest.hasVeto = houseguest.id === resolved.winnerId;
  }
  applyMoraleDelta(getHouseguest(state, resolved.winnerId), MORALE.WIN_VETO);
  state.phase = "scheme_3";
  return {
    state,
    events: [
      { t: "comp", week: state.week, phase: "veto_comp", ...resolved },
      { t: "host", week: state.week, text: `${getHouseguest(state, resolved.winnerId).name} wins the Power of Veto.` },
    ],
    done: false,
  };
}

async function runVetoCeremony(state: GameState, deps: StepDeps): Promise<StepResult> {
  const decision = await withValidation(
    () =>
      deps.decider.useVeto({
        state,
        actorId: state.vetoHolderId!,
        legalIds: [...state.nomineeIds],
        reason: "veto_use",
        nomineeIds: [...state.nomineeIds],
        vetoHolderId: state.vetoHolderId!,
      }),
    (candidate) => validateVetoUse(state, candidate),
    () => ({ use: false, savedNomineeId: null }),
  );

  let replacementNomId: string | null = null;
  if (decision.use && decision.savedNomineeId) {
    const legalIds = legalReplacementNominees(state, decision.savedNomineeId);
    replacementNomId = await withValidation(
      () =>
        deps.decider.pickReplacementNom({
          state,
          actorId: state.hohId!,
          legalIds,
          reason: "replacement_nomination",
          savedNomineeId: decision.savedNomineeId!,
        }),
      (candidate) => (legalIds.includes(candidate) ? candidate : null),
      () => deps.rng.pick(legalIds),
    );
  }

  applyVetoUse(state, decision, replacementNomId);
  state.phase = "scheme_4";

  return {
    state,
    events: [
      {
        t: "ceremony",
        week: state.week,
        kind: "veto",
        payload: {
          vetoHolderId: state.vetoHolderId,
          used: decision.use,
          savedNomineeId: decision.savedNomineeId,
          replacementNomId,
          nomineeIds: [...state.nomineeIds],
        },
      },
      {
        t: "host",
        week: state.week,
        text: decision.use
          ? `The veto is used. Final nominees: ${nomineeNames(state)}.`
          : `The veto is not used. Final nominees: ${nomineeNames(state)}.`,
      },
    ],
    done: false,
  };
}

function evictHouseguest(state: GameState, evictedId: string, preEvictionHouseSize: number): GameEvent {
  clearHaveNot(state, evictedId);
  const evicted = getHouseguest(state, evictedId);
  const toJury = isJuror(preEvictionHouseSize);
  evicted.status = toJury ? "jury" : "evicted";
  evicted.isHOH = false;
  evicted.isNominated = false;
  evicted.hasVeto = false;
  evicted.isHaveNot = false;

  let jurorNumber: number | undefined;
  if (toJury) {
    state.juryIds.push(evictedId);
    jurorNumber = state.juryIds.length;
  }

  return { t: "eviction", week: state.week, evictedId, toJury, preEvictionHouseSize, jurorNumber };
}

function applySurvivalMorale(state: GameState, evictedId: string): void {
  for (const nomineeId of state.nomineeIds) {
    if (nomineeId !== evictedId) {
      applyMoraleDelta(getHouseguest(state, nomineeId), MORALE.SURVIVE_BLOCK);
    }
  }
  for (const houseguest of activeHouseguests(state)) {
    applyMoraleDelta(houseguest, MORALE.SURVIVE_WEEK);
  }
}

function advanceAfterEviction(state: GameState): void {
  const activeCount = activeHouseguests(state).length;

  if (state.isDoubleEviction) {
    state.doubleEvictionRemaining -= 1;
    if (state.doubleEvictionRemaining > 0) {
      state.phase = "hoh_comp";
      return;
    }
    state.isDoubleEviction = false;
    state.doubleEvictionRemaining = 0;
  }

  expireHaveNots(state);

  if (activeCount === 3) {
    state.phase = "final_hoh";
    state.week += 1;
    return;
  }
  state.phase = "hoh_comp";
  state.week += 1;
}

async function runEviction(state: GameState, deps: StepDeps): Promise<StepResult> {
  const events: GameEvent[] = [];
  const preEvictionHouseSize = activeHouseguests(state).length;

  if (preEvictionHouseSize === 4) {
    const voterId = finalFourSoleVoter(state);
    const evictedId = await withValidation(
      () =>
        deps.decider.castEvictionVote({
          state,
          actorId: voterId,
          legalIds: [...state.nomineeIds],
          reason: "final_four_sole_vote",
          nomineeIds: [...state.nomineeIds],
        }),
      (decision) => validateEvictionVote(state, decision),
      () => deps.rng.pick(state.nomineeIds),
    );
    events.push({ t: "vote", week: state.week, voterId, targetId: evictedId, confessional: "Final 4 sole vote." });
    events.push({
      t: "ceremony",
      week: state.week,
      kind: "eviction",
      payload: { nomineeIds: [...state.nomineeIds], voteCounts: { [evictedId]: 1 }, evictedId, finalFourSoleVote: true },
    });
    events.push(evictHouseguest(state, evictedId, preEvictionHouseSize));
    applySurvivalMorale(state, evictedId);
    advanceAfterEviction(state);
    return { state, events, done: false };
  }

  const voters = evictionVoters(state);
  const votes = await Promise.all(
    voters.map(async (voterId) => {
    const targetId = await withValidation(
      () =>
        deps.decider.castEvictionVote({
          state,
          actorId: voterId,
          legalIds: [...state.nomineeIds],
          reason: "eviction_vote",
          nomineeIds: [...state.nomineeIds],
        }),
      (decision) => validateEvictionVote(state, decision),
      () => deps.rng.pick(state.nomineeIds),
    );
      return { voterId, targetId };
    }),
  );
  for (const vote of votes) {
    events.push({ t: "vote", week: state.week, voterId: vote.voterId, targetId: vote.targetId });
  }

  const counts = tallyVotes(votes);
  const result = evictionResultFromTally(state, counts);
  let evictedId: string;
  if (result.tied) {
    evictedId = await withValidation(
      () =>
        deps.decider.castEvictionVote({
          state,
          actorId: state.hohId!,
          legalIds: result.leaders,
          reason: "hoh_tiebreak",
          nomineeIds: result.leaders,
          isTiebreaker: true,
        }),
      (decision) => (result.leaders.includes(decision) ? decision : null),
      () => deps.rng.pick(result.leaders),
    );
    events.push({ t: "vote", week: state.week, voterId: state.hohId!, targetId: evictedId, isTiebreaker: true });
  } else {
    evictedId = result.leaders[0]!;
  }

  events.push({
    t: "ceremony",
    week: state.week,
    kind: "eviction",
    payload: { nomineeIds: [...state.nomineeIds], voteCounts: counts, tied: result.tied, evictedId },
  });
  events.push(evictHouseguest(state, evictedId, preEvictionHouseSize));
  applySurvivalMorale(state, evictedId);
  advanceAfterEviction(state);

  return { state, events, done: false };
}

export async function step(inputState: GameState, deps: StepDeps): Promise<StepResult> {
  const state = cloneState(inputState);

  if (state.phase === "final_hoh") {
    const result = await runFinalHoh(state, deps);
    return { ...result, done: false };
  }

  if (state.phase === "final_2_jury") {
    return runFinalJuryVote(state, deps);
  }

  if (state.phase === "hoh_comp") {
    return runHohComp(state, deps);
  }

  if (state.phase === "nominations") {
    return runNominations(state, deps);
  }

  if (state.phase === "veto_comp") {
    return runVetoComp(state, deps);
  }

  if (state.phase === "veto_ceremony") {
    return runVetoCeremony(state, deps);
  }

  if (state.phase === "eviction") {
    return runEviction(state, deps);
  }

  const nextPhase = nextSchemePhase(state.phase);
  const schemeNumber = state.phase.replace("scheme_", "");
  state.phase = nextPhase;
  return {
    state,
    events: [{ t: "host", week: state.week, text: `Scheming window ${schemeNumber}: placeholder agents talk in circles.` }],
    done: false,
  };
}
