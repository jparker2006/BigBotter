import type { GameState } from "../types";

export type VoteCounts = Record<string, number>;

export function validateEvictionVote(state: GameState, targetId: string): string | null {
  return state.nomineeIds.includes(targetId) ? targetId : null;
}

export function tallyVotes(votes: readonly { targetId: string }[]): VoteCounts {
  return votes.reduce<VoteCounts>((counts, vote) => {
    counts[vote.targetId] = (counts[vote.targetId] ?? 0) + 1;
    return counts;
  }, {});
}

export function evictionResultFromTally(state: GameState, counts: VoteCounts): { tied: boolean; leaders: string[] } {
  const maxVotes = Math.max(...state.nomineeIds.map((id) => counts[id] ?? 0));
  const leaders = state.nomineeIds.filter((id) => (counts[id] ?? 0) === maxVotes);
  return { tied: leaders.length > 1, leaders };
}

