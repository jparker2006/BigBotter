import type { AgentDecider, CompAnswer, CompQuestion } from "../agents/decider";
import type { Rng } from "../rng";
import type { CompRound, GameState, Houseguest, Phase } from "../types";
import { COMP_CATALOG, type CompType } from "./compCatalog";
import { CompType as CompKind } from "./compCatalog";
import { scorePerformance } from "./performance";

export type ResolvedComp = {
  compType: CompType;
  playerIds: string[];
  rounds: CompRound[];
  results: Record<string, number>;
  winnerId: string;
  title?: string;
  narration?: string;
};

const KNOWLEDGE_COMPS = new Set<CompType>([CompKind.OTEV, CompKind.Memory, CompKind.QnA, CompKind.Puzzle, CompKind.Knockout]);

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

function fallbackQuestions(state: GameState, compType: CompType, count: number): CompQuestion[] {
  const history = state.publicHistory.length > 0 ? state.publicHistory : [`Week ${state.week}: the game began.`];
  return Array.from({ length: count }, (_, index) => {
    const sourceEvent = history[Math.max(0, history.length - 1 - (index % history.length))]!;
    const prompt =
      compType === CompKind.OTEV
        ? `OTEV bellows a nasty rhyme: "Slide through slime and name this crime: ${sourceEvent}"`
        : `Recall this season event: ${sourceEvent}`;
    return {
      id: `q${index + 1}`,
      prompt,
      correctAnswer: sourceEvent,
      sourceEvent,
    };
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isCorrectAnswer(answer: string, question: CompQuestion): boolean {
  const normalizedAnswer = normalize(answer);
  const normalizedCorrect = normalize(question.correctAnswer);
  return normalizedAnswer.length > 0 && (normalizedAnswer.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedAnswer));
}

function fallbackAnswer(player: Houseguest, question: CompQuestion, rng: Rng): CompAnswer {
  const knowledge = (player.stats.memory + player.stats.iq) / 2;
  const likelyCorrect = rng.nextFloat(0, 100) < knowledge * 0.82 + player.stats.luck * 0.08;
  return {
    answer: likelyCorrect ? question.correctAnswer : "I am guessing based on vibes.",
    confidence: likelyCorrect ? rng.nextFloat(0.55, 0.95) : rng.nextFloat(0.1, 0.55),
  };
}

async function getQuestions(
  state: GameState,
  decider: AgentDecider,
  compType: CompType,
  phase: Phase | "final_hoh_part_1" | "final_hoh_part_2" | "final_hoh_part_3",
  playerIds: string[],
  roundCount: number,
): Promise<CompQuestion[]> {
  if (!KNOWLEDGE_COMPS.has(compType) || !decider.generateCompQuestions) {
    return fallbackQuestions(state, compType, roundCount);
  }
  try {
    const generated = await decider.generateCompQuestions({ state, compType, phase, playerIds, roundCount });
    const usable = generated.filter((question) => question.prompt.trim() && question.correctAnswer.trim());
    return usable.length >= roundCount ? usable.slice(0, roundCount) : fallbackQuestions(state, compType, roundCount);
  } catch {
    return fallbackQuestions(state, compType, roundCount);
  }
}

async function answerQuestion(
  state: GameState,
  decider: AgentDecider,
  player: Houseguest,
  compType: CompType,
  question: CompQuestion,
  round: number,
  rng: Rng,
): Promise<CompAnswer> {
  if (!KNOWLEDGE_COMPS.has(compType) || !decider.answerCompQuestion) {
    return fallbackAnswer(player, question, rng);
  }
  try {
    const answer = await decider.answerCompQuestion({
      state,
      actorId: player.id,
      legalIds: [],
      reason: "comp_answer",
      compType,
      question,
      round,
    });
    return {
      answer: answer.answer.slice(0, 180),
      confidence: Math.max(0, Math.min(1, answer.confidence)),
    };
  } catch {
    return fallbackAnswer(player, question, rng);
  }
}

async function scoreKnowledgeRound(
  state: GameState,
  decider: AgentDecider,
  compType: CompType,
  players: readonly Houseguest[],
  question: CompQuestion,
  round: number,
  rng: Rng,
): Promise<{ scores: Record<string, number>; answers: NonNullable<CompRound["answers"]> }> {
  const definition = COMP_CATALOG[compType];
  const answers = await Promise.all(
    players.map(async (player) => {
      const raw = await answerQuestion(state, decider, player, compType, question, round, rng);
      const correct = isCorrectAnswer(raw.answer, question);
      const scoreDelta = correct ? 16 + raw.confidence * 10 : -18 + raw.confidence * 4;
      const baseScore = scorePerformance(player, definition.weights, rng, compType);
      return {
        id: player.id,
        score: baseScore + scoreDelta,
        answer: {
          answer: raw.answer,
          correct,
          confidence: raw.confidence,
          scoreDelta,
        },
      };
    }),
  );

  return {
    scores: Object.fromEntries(answers.map((answer) => [answer.id, answer.score])),
    answers: Object.fromEntries(answers.map((answer) => [answer.id, answer.answer])),
  };
}

export async function resolveCompWithFlavor(
  compType: CompType,
  players: readonly Houseguest[],
  rng: Rng,
  options: {
    state: GameState;
    decider: AgentDecider;
    phase: Phase | "final_hoh_part_1" | "final_hoh_part_2" | "final_hoh_part_3";
  },
): Promise<ResolvedComp> {
  if (!KNOWLEDGE_COMPS.has(compType)) {
    return resolveComp(compType, players, rng);
  }
  if (players.length === 0) {
    throw new Error("Cannot resolve a competition with no players.");
  }

  const definition = COMP_CATALOG[compType];
  const playerIds = players.map((player) => player.id);
  const roundCount = definition.multiRound ? Math.max(1, players.length - 1) : 1;
  const questions = await getQuestions(options.state, options.decider, compType, options.phase, playerIds, roundCount);
  const title = compType === CompKind.OTEV ? "OTEV's Season Slop Slide" : undefined;
  const narration =
    compType === CompKind.OTEV
      ? "A punny animatronic menace screams clues from this season while the players sprint through slime."
      : undefined;

  if (!definition.multiRound || players.length === 1) {
    const question = questions[0]!;
    const scored = await scoreKnowledgeRound(options.state, options.decider, compType, players, question, 1, rng);
    const winnerId = [...players].sort((a, b) => scored.scores[b.id]! - scored.scores[a.id]!)[0]!.id;
    return {
      compType,
      playerIds,
      rounds: [
        {
          round: 1,
          scores: scored.scores,
          question: question.prompt,
          correctAnswer: question.correctAnswer,
          answers: scored.answers,
        },
      ],
      results: scored.scores,
      winnerId,
      title,
      narration,
    };
  }

  let remaining = [...players];
  const rounds: CompRound[] = [];
  const finalResults: Record<string, number> = {};

  while (remaining.length > 1) {
    const question = questions[rounds.length] ?? fallbackQuestions(options.state, compType, 1)[0]!;
    const scored = await scoreKnowledgeRound(options.state, options.decider, compType, remaining, question, rounds.length + 1, rng);
    const eliminatedId = [...remaining].sort((a, b) => scored.scores[a.id]! - scored.scores[b.id]!)[0]!.id;
    rounds.push({
      round: rounds.length + 1,
      scores: scored.scores,
      eliminatedId,
      question: question.prompt,
      correctAnswer: question.correctAnswer,
      answers: scored.answers,
      narration: compType === CompKind.OTEV ? "Wrong answer or slowest crawl gets swallowed by OTEV." : undefined,
    });
    for (const [id, score] of Object.entries(scored.scores)) {
      finalResults[id] = score;
    }
    remaining = remaining.filter((player) => player.id !== eliminatedId);
  }

  const winnerId = remaining[0]!.id;
  finalResults[winnerId] = finalResults[winnerId] ?? scorePerformance(remaining[0]!, definition.weights, rng, compType);
  return { compType, playerIds, rounds, results: finalResults, winnerId, title, narration };
}
