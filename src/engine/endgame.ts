import type { AgentDecider } from "./agents/decider";
import { withValidation } from "./agents/validateDecision";
import { finalHohParts } from "./comps/compScheduler";
import { resolveComp } from "./comps/resolveComp";
import { isJuror } from "./jury";
import type { Rng } from "./rng";
import { activeHouseguests, getHouseguest } from "./selectors";
import type { GameEvent, GameState } from "./types";

export async function runFinalHoh(
  state: GameState,
  deps: { rng: Rng; decider: AgentDecider },
): Promise<{ state: GameState; events: GameEvent[] }> {
  const events: GameEvent[] = [{ t: "host", week: state.week, text: "Final 3 begins: a three-part HOH will decide the Final 2." }];
  const active = activeHouseguests(state);
  if (active.length !== 3) {
    throw new Error(`Final HOH requires 3 active houseguests; found ${active.length}.`);
  }

  const [part1Type, part2Type, part3Type] = finalHohParts();
  const part1 = resolveComp(part1Type, active, deps.rng);
  events.push({ t: "comp", week: state.week, phase: "final_hoh_part_1", ...part1 });

  const part1Winner = part1.winnerId;
  const part2Players = active.filter((houseguest) => houseguest.id !== part1Winner);
  const part2 = resolveComp(part2Type, part2Players, deps.rng);
  events.push({ t: "comp", week: state.week, phase: "final_hoh_part_2", ...part2 });

  const part3Players = [getHouseguest(state, part1Winner), getHouseguest(state, part2.winnerId)];
  const part3 = resolveComp(part3Type, part3Players, deps.rng);
  events.push({ t: "comp", week: state.week, phase: "final_hoh_part_3", ...part3 });

  state.hohId = part3.winnerId;
  for (const houseguest of state.houseguests) {
    houseguest.isHOH = houseguest.id === part3.winnerId;
    houseguest.isNominated = false;
    houseguest.hasVeto = false;
  }

  const evictionOptions = activeHouseguests(state).filter((houseguest) => houseguest.id !== state.hohId).map((houseguest) => houseguest.id);
  const evictedId = await withValidation(
    () =>
      deps.decider.finalHohEviction({
        state,
        actorId: state.hohId!,
        legalIds: evictionOptions,
        reason: "final_hoh_eviction",
        finalistOptions: evictionOptions,
      }),
    (decision) => (evictionOptions.includes(decision) ? decision : null),
    () => deps.rng.pick(evictionOptions),
  );

  const preEvictionHouseSize = 3;
  const evicted = getHouseguest(state, evictedId);
  evicted.status = isJuror(preEvictionHouseSize) ? "jury" : "evicted";
  evicted.isHOH = false;
  const jurorNumber = state.juryIds.length + 1;
  state.juryIds.push(evictedId);
  state.phase = "final_2_jury";
  state.nomineeIds = [];
  state.vetoHolderId = null;
  state.replacementNomId = null;

  events.push({
    t: "ceremony",
    week: state.week,
    kind: "eviction",
    payload: { finalHohId: state.hohId, soleVoteTargetId: evictedId, evictedId, finalHoh: true },
  });
  events.push({ t: "eviction", week: state.week, evictedId, toJury: true, preEvictionHouseSize, jurorNumber });

  return { state, events };
}

export async function runFinalJuryVote(
  state: GameState,
  deps: { rng: Rng; decider: AgentDecider },
): Promise<{ state: GameState; events: GameEvent[]; done: boolean }> {
  const events: GameEvent[] = [{ t: "host", week: state.week, text: "Final 2 face the jury." }];
  const finalists = activeHouseguests(state).map((houseguest) => houseguest.id);
  if (finalists.length !== 2) {
    throw new Error(`Final jury vote requires 2 finalists; found ${finalists.length}.`);
  }
  if (state.juryIds.length !== 7) {
    throw new Error(`Final jury vote requires 7 jurors; found ${state.juryIds.length}.`);
  }

  const tally: Record<string, number> = Object.fromEntries(finalists.map((id) => [id, 0]));
  for (const jurorId of state.juryIds) {
    const finalistId = await withValidation(
      () =>
        deps.decider.juryVote({
          state,
          actorId: jurorId,
          legalIds: finalists,
          reason: "jury_vote",
          finalistIds: finalists,
        }),
      (decision) => (finalists.includes(decision) ? decision : null),
      () => deps.rng.pick(finalists),
    );
    tally[finalistId] = (tally[finalistId] ?? 0) + 1;
    events.push({ t: "jury_vote", jurorId, finalistId, reasoning: "Random placeholder juror vote." });
  }

  const winnerId = finalists.sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))[0]!;
  events.push({
    t: "host",
    week: state.week,
    text: `${getHouseguest(state, winnerId).name} wins Big Botter by a vote of ${tally[winnerId]} to ${7 - tally[winnerId]!}.`,
    payload: { kind: "winner", winnerId, finalistIds: finalists, tally },
  });

  return { state, events, done: true };
}
