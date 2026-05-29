import type { Rng } from "../rng";
import type { CompRound, Houseguest } from "../types";
import { COMP_CATALOG, type CompType } from "./compCatalog";
import { scorePerformance } from "./performance";

export type ResolvedComp = {
  compType: CompType;
  playerIds: string[];
  rounds: CompRound[];
  results: Record<string, number>;
  winnerId: string;
};

export function resolveComp(compType: CompType, players: readonly Houseguest[], rng: Rng): ResolvedComp {
  if (players.length === 0) {
    throw new Error("Cannot resolve a competition with no players.");
  }

  const definition = COMP_CATALOG[compType];
  const playerIds = players.map((player) => player.id);

  if (!definition.multiRound || players.length === 1) {
    const results = Object.fromEntries(
      players.map((player) => [player.id, scorePerformance(player, definition.weights, rng, compType)]),
    );
    const winnerId = [...players].sort((a, b) => results[b.id]! - results[a.id]!)[0]!.id;
    return { compType, playerIds, rounds: [{ round: 1, scores: results }], results, winnerId };
  }

  let remaining = [...players];
  const rounds: CompRound[] = [];
  const finalResults: Record<string, number> = {};

  while (remaining.length > 1) {
    const scores = Object.fromEntries(
      remaining.map((player) => [player.id, scorePerformance(player, definition.weights, rng, compType)]),
    );
    const eliminatedId = [...remaining].sort((a, b) => scores[a.id]! - scores[b.id]!)[0]!.id;
    rounds.push({ round: rounds.length + 1, scores, eliminatedId });
    for (const [id, score] of Object.entries(scores)) {
      finalResults[id] = score;
    }
    remaining = remaining.filter((player) => player.id !== eliminatedId);
  }

  const winnerId = remaining[0]!.id;
  finalResults[winnerId] = finalResults[winnerId] ?? scorePerformance(remaining[0]!, definition.weights, rng, compType);

  return { compType, playerIds, rounds, results: finalResults, winnerId };
}

