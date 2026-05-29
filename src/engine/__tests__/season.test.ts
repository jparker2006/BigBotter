import { describe, expect, it } from "vitest";
import { RandomDecider } from "../agents/randomDecider";
import type { AgentDecider, DecisionContext } from "../agents/decider";
import type { VetoUseDecision } from "../rules/veto";
import { createInitialState } from "../houseguestFactory";
import { runSeason } from "../season";
import { createRng, type Rng } from "../rng";
import { step } from "../stepper";
import type { GameEvent, GameState, SeasonTape } from "../types";

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

function eventsOf<T extends GameEvent["t"]>(tape: SeasonTape, type: T): Extract<GameEvent, { t: T }>[] {
  return tape.events.filter((event): event is Extract<GameEvent, { t: T }> => event.t === type);
}

function winnerId(tape: SeasonTape): string | undefined {
  const winner = eventsOf(tape, "host").find((event) => (event.payload as { kind?: string } | undefined)?.kind === "winner");
  return (winner?.payload as { winnerId?: string } | undefined)?.winnerId;
}

function finalistIds(tape: SeasonTape): string[] {
  const evictedIds = new Set(eventsOf(tape, "eviction").map((event) => event.evictedId));
  return tape.state0.houseguests.filter((houseguest) => !evictedIds.has(houseguest.id)).map((houseguest) => houseguest.id);
}

function assertSeasonInvariants(tape: SeasonTape) {
  const evictions = eventsOf(tape, "eviction");
  const jurorEvictions = evictions.filter((event) => event.toJury);
  const finalists = finalistIds(tape);
  const winner = winnerId(tape);

  expect(evictions).toHaveLength(14);
  expect(finalists).toHaveLength(2);
  expect(winner).toBeDefined();
  expect(finalists).toContain(winner);
  expect(jurorEvictions).toHaveLength(7);
  expect(jurorEvictions.map((event) => event.preEvictionHouseSize)).toEqual([9, 8, 7, 6, 5, 4, 3]);
  expect(jurorEvictions.map((event) => event.jurorNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);

  let expectedPreSize = 16;
  for (const eviction of evictions) {
    expect(eviction.preEvictionHouseSize).toBe(expectedPreSize);
    expect(eviction.toJury).toBe(eviction.preEvictionHouseSize <= 9);
    expectedPreSize -= 1;
  }

  const juryVotes = eventsOf(tape, "jury_vote");
  expect(juryVotes).toHaveLength(7);
  for (const vote of juryVotes) {
    expect(finalists).toContain(vote.finalistId);
  }
}

function assertEligibilityAndCeremonies(tape: SeasonTape) {
  let activeCount = 16;
  let currentHohId: string | null = null;
  let currentNomineeIds: string[] = [];
  let currentVetoHolderId: string | null = null;
  let previousHohId: string | null = null;
  let seenFirstHoh = false;
  const pendingVotes: Extract<GameEvent, { t: "vote" }>[] = [];

  for (const event of tape.events) {
    if (event.t === "comp" && event.phase === "hoh_comp") {
      if (seenFirstHoh && previousHohId) {
        expect(event.playerIds).not.toContain(previousHohId);
      }
      seenFirstHoh = true;
      currentHohId = event.winnerId;
      previousHohId = event.winnerId;
    }

    if (event.t === "ceremony" && event.kind === "nomination") {
      currentNomineeIds = event.payload.nomineeIds as string[];
      expect(currentNomineeIds).toHaveLength(2);
      expect(new Set(currentNomineeIds).size).toBe(2);
      expect(currentNomineeIds).not.toContain(currentHohId);
    }

    if (event.t === "comp" && event.phase === "veto_comp") {
      currentVetoHolderId = event.winnerId;
      expect(event.playerIds).toHaveLength(Math.min(6, activeCount));
      expect(event.playerIds).toContain(currentHohId);
      for (const nomineeId of currentNomineeIds) {
        expect(event.playerIds).toContain(nomineeId);
      }
    }

    if (event.t === "ceremony" && event.kind === "veto") {
      const used = event.payload.used as boolean;
      const savedNomineeId = event.payload.savedNomineeId as string | null;
      const replacementNomId = event.payload.replacementNomId as string | null;
      const finalNominees = event.payload.nomineeIds as string[];
      expect(finalNominees).toHaveLength(2);
      expect(new Set(finalNominees).size).toBe(2);
      if (used) {
        expect(savedNomineeId).toBeTruthy();
        expect(currentNomineeIds).toContain(savedNomineeId);
        expect(finalNominees).not.toContain(savedNomineeId);
        expect(replacementNomId).toBeTruthy();
        expect(replacementNomId).not.toBe(currentHohId);
        expect(replacementNomId).not.toBe(currentVetoHolderId);
        expect(replacementNomId).not.toBe(savedNomineeId);
      }
      currentNomineeIds = finalNominees;
    }

    if (event.t === "vote") {
      expect(event.targetId).toSatisfy((targetId: string) => currentNomineeIds.includes(targetId));
      if (!event.isTiebreaker) {
        expect(event.voterId).not.toBe(currentHohId);
        expect(currentNomineeIds).not.toContain(event.voterId);
      } else {
        expect(event.voterId).toBe(currentHohId);
      }
      pendingVotes.push(event);
    }

    if (event.t === "ceremony" && event.kind === "eviction") {
      const evictedId = event.payload.evictedId as string;
      const voteCounts = event.payload.voteCounts as Record<string, number> | undefined;
      const finalFourSoleVote = event.payload.finalFourSoleVote as boolean | undefined;
      if (finalFourSoleVote) {
        expect(activeCount).toBe(4);
        expect(pendingVotes.filter((vote) => !vote.isTiebreaker)).toHaveLength(1);
      }
      if (voteCounts) {
        const nonTiebreakVotes = pendingVotes.filter((vote) => !vote.isTiebreaker);
        const tied = event.payload.tied as boolean | undefined;
        const maxVotes = Math.max(...currentNomineeIds.map((id) => voteCounts[id] ?? 0));
        expect(currentNomineeIds.filter((id) => (voteCounts[id] ?? 0) === maxVotes)).toContain(evictedId);
        expect(pendingVotes.some((vote) => vote.isTiebreaker)).toBe(Boolean(tied));
        expect(nonTiebreakVotes).toHaveLength(activeCount === 4 ? 1 : activeCount - 3);
      }
      pendingVotes.length = 0;
    }

    if (event.t === "eviction") {
      activeCount -= 1;
    }
  }
}

function assertDoubleEviction(tape: SeasonTape) {
  const marker = eventsOf(tape, "host").find((event) => event.text.includes("DOUBLE EVICTION"));
  expect(marker).toBeDefined();
  const week = marker!.week;
  const weekEvictions = eventsOf(tape, "eviction").filter((event) => event.week === week);
  expect(weekEvictions).toHaveLength(2);
  expect(weekEvictions.map((event) => event.preEvictionHouseSize)).toEqual([8, 7]);
}

class IllegalDecider implements AgentDecider {
  constructor(private readonly fallback: RandomDecider) {}

  async pickNominations(): Promise<string[]> {
    return ["not-real", "not-real"];
  }

  async useVeto(): Promise<VetoUseDecision> {
    return { use: true, savedNomineeId: "not-real" };
  }

  async pickReplacementNom(): Promise<string> {
    return "not-real";
  }

  async castEvictionVote(): Promise<string> {
    return "not-real";
  }

  async finalHohEviction(): Promise<string> {
    return "not-real";
  }

  async juryVote(): Promise<string> {
    return "not-real";
  }

  async pickHouseguestChoice(context: DecisionContext): Promise<string> {
    return this.fallback.pickHouseguestChoice(context);
  }
}

async function runWithDecider(seed: number, deciderFactory: (rng: Rng) => AgentDecider) {
  const rng = createRng(seed);
  let state: GameState = createInitialState(seed, rng);
  const events: GameEvent[] = [];
  const decider = deciderFactory(rng);
  let done = false;

  while (!done) {
    const result = await step(state, { rng, decider });
    state = result.state;
    events.push(...result.events);
    for (const houseguest of state.houseguests) {
      expect(houseguest.morale).toBeGreaterThanOrEqual(0);
      expect(houseguest.morale).toBeLessThanOrEqual(100);
    }
    if (state.haveNotIds.length === 0) {
      expect(state.haveNotMoraleDeltas).toEqual({});
    }
    done = result.done;
  }

  return { state, tape: { state0: createInitialState(seed, createRng(seed)), events } };
}

describe("Milestone 1 deterministic season", () => {
  it("satisfies season invariants across many seeds", async () => {
    for (const seed of SEEDS) {
      const tape = await runSeason(seed);
      assertSeasonInvariants(tape);
      assertEligibilityAndCeremonies(tape);
      assertDoubleEviction(tape);
    }
  });

  it("is deterministic for a fixed seed", async () => {
    const first = await runSeason(8675309);
    const second = await runSeason(8675309);
    expect(JSON.stringify(first.events)).toBe(JSON.stringify(second.events));
  });

  it("keeps morale clamped and expires have-nots without stale deltas", async () => {
    await runWithDecider(42, (rng) => new RandomDecider(rng));
  });

  it("repairs illegal decider outputs before applying decisions", async () => {
    const { tape } = await runWithDecider(99, (rng) => new IllegalDecider(new RandomDecider(rng)));
    assertSeasonInvariants(tape);
    assertEligibilityAndCeremonies(tape);
  });

  it("emits social movement and conversation events with private notebook effects", async () => {
    const { state, tape } = await runWithDecider(1234, (rng) => new RandomDecider(rng));
    expect(eventsOf(tape, "movement").length).toBeGreaterThan(0);
    expect(eventsOf(tape, "conversation").length).toBeGreaterThan(0);
    expect(eventsOf(tape, "conversation").some((event) => event.participantIds.length > 2)).toBe(true);

    const notebooksWithMemories = state.houseguests.filter((houseguest) => houseguest.notebook.memoryLog.length > 0);
    const relationshipChanges = state.houseguests.flatMap((houseguest) =>
      Object.values(houseguest.notebook.relationships).filter((relationship) => relationship.trust !== 0),
    );
    expect(notebooksWithMemories.length).toBeGreaterThan(0);
    expect(relationshipChanges.length).toBeGreaterThan(0);
  });

  it("emits M5 flavor and knowledge-comp answer data", async () => {
    const { state, tape } = await runWithDecider(2026, (rng) => new RandomDecider(rng));
    expect(eventsOf(tape, "confessional").length).toBeGreaterThan(0);
    expect(state.publicHistory.length).toBeGreaterThan(0);

    const knowledgeComps = eventsOf(tape, "comp").filter((event) =>
      ["OTEV", "Memory", "QnA", "Puzzle", "Knockout"].includes(event.compType),
    );
    expect(knowledgeComps.length).toBeGreaterThan(0);
    expect(knowledgeComps.some((event) => event.rounds.some((round) => round.question && round.answers))).toBe(true);

    const otev = knowledgeComps.find((event) => event.compType === "OTEV");
    expect(otev?.rounds.some((round) => round.question?.includes("OTEV"))).toBe(true);
  });
});
