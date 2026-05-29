import type { StatKey } from "../types";

export enum CompType {
  Endurance = "Endurance",
  Puzzle = "Puzzle",
  OTEV = "OTEV",
  Memory = "Memory",
  Physical = "Physical",
  Skill = "Skill",
  Crapshoot = "Crapshoot",
  QnA = "QnA",
  Knockout = "Knockout",
}

export type StatWeights = Partial<Record<StatKey, number>>;

export type CompDefinition = {
  type: CompType;
  weights: StatWeights;
  multiRound: boolean;
  roundCount?: number;
};

export const COMP_CATALOG: Record<CompType, CompDefinition> = {
  [CompType.Endurance]: {
    type: CompType.Endurance,
    weights: { endurance: 0.5, strength: 0.25, luck: 0.1 },
    multiRound: false,
  },
  [CompType.Puzzle]: {
    type: CompType.Puzzle,
    weights: { iq: 0.4, memory: 0.25, speed: 0.2, luck: 0.05 },
    multiRound: false,
  },
  [CompType.OTEV]: {
    type: CompType.OTEV,
    weights: { memory: 0.3, iq: 0.25, agility: 0.2, speed: 0.15, luck: 0.05 },
    multiRound: true,
  },
  [CompType.Memory]: {
    type: CompType.Memory,
    weights: { memory: 0.5, iq: 0.3, luck: 0.05 },
    multiRound: false,
  },
  [CompType.Physical]: {
    type: CompType.Physical,
    weights: { strength: 0.35, agility: 0.25, speed: 0.25, luck: 0.05 },
    multiRound: false,
  },
  [CompType.Skill]: {
    type: CompType.Skill,
    weights: { agility: 0.35, speed: 0.25, iq: 0.15, luck: 0.1 },
    multiRound: false,
  },
  [CompType.Crapshoot]: {
    type: CompType.Crapshoot,
    weights: { luck: 0.35 },
    multiRound: false,
  },
  [CompType.QnA]: {
    type: CompType.QnA,
    weights: { iq: 0.35, memory: 0.35, speed: 0.15, luck: 0.05 },
    multiRound: false,
  },
  [CompType.Knockout]: {
    type: CompType.Knockout,
    weights: { iq: 0.2, memory: 0.2, speed: 0.2, charisma: 0.1, luck: 0.1 },
    multiRound: true,
  },
};

