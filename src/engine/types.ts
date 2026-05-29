export type StatKey =
  | "strength"
  | "endurance"
  | "agility"
  | "speed"
  | "iq"
  | "memory"
  | "charisma"
  | "luck";

export type Stats = Record<StatKey, number>;

export type RoomId =
  | "hoh_room"
  | "bedrooms"
  | "kitchen"
  | "living_room"
  | "backyard"
  | "diary_room"
  | "have_not_room"
  | "storage";

export interface Houseguest {
  id: string;
  name: string;
  age: number;
  occupation: string;
  hometown: string;
  bio: string;
  personality: string;
  talkingStyle: string;
  archetype: string;
  stats: Stats;
  morale: number;
  portraitUrl: string;
  status: "active" | "evicted" | "jury";
  isHOH: boolean;
  isNominated: boolean;
  hasVeto: boolean;
  isHaveNot: boolean;
  location: RoomId;
  notebook: Notebook;
}

export interface Relationship {
  targetId: string;
  trust: number;
  sentiment: string;
  isShowmance: boolean;
  notes: string;
}

export interface Memory {
  what: string;
  magnitude: number;
  week: number;
}

export interface Deal {
  id: string;
  partyIds: string[];
  terms: string;
  week: number;
  status: "active" | "honored" | "broken";
}

export interface Grudge {
  againstId: string;
  what: string;
  magnitude: number;
  week: number;
}

export interface Notebook {
  relationships: Record<string, Relationship>;
  allianceIds: string[];
  targetIds: string[];
  deals: Deal[];
  secretsKnown: string[];
  reads: string[];
  grudges: Grudge[];
  memoryLog: Memory[];
}

export interface Alliance {
  id: string;
  name: string;
  memberIds: string[];
  formedWeek: number;
  isActive: boolean;
  secret: boolean;
}

export type Phase =
  | "hoh_comp"
  | "scheme_1"
  | "nominations"
  | "scheme_2"
  | "veto_comp"
  | "scheme_3"
  | "veto_ceremony"
  | "scheme_4"
  | "eviction"
  | "final_hoh"
  | "final_2_jury";

export interface GameState {
  seasonId: string;
  seed: number;
  week: number;
  phase: Phase;
  isDoubleEviction: boolean;
  houseguests: Houseguest[];
  hohId: string | null;
  nomineeIds: string[];
  vetoHolderId: string | null;
  replacementNomId: string | null;
  alliances: Alliance[];
  juryIds: string[];
  haveNotIds: string[];
  haveNotMoraleDeltas: Record<string, number>;
  doubleEvictionRemaining: number;
  usedCompTypes: string[];
  publicHistory: string[];
}

export type CeremonyKind = "nomination" | "veto" | "eviction";

export type CompRound = {
  round: number;
  scores: Record<string, number>;
  eliminatedId?: string;
  question?: string;
  correctAnswer?: string;
  answers?: Record<string, { answer: string; correct: boolean; confidence: number; scoreDelta: number }>;
  narration?: string;
};

export type GameEvent =
  | { t: "host"; text: string; week?: number; payload?: unknown }
  | {
      t: "comp";
      week: number;
      phase: Phase | "final_hoh_part_1" | "final_hoh_part_2" | "final_hoh_part_3";
      compType: string;
      playerIds: string[];
      rounds: CompRound[];
      results: Record<string, number>;
      winnerId: string;
      title?: string;
      narration?: string;
    }
  | { t: "movement"; hgId: string; from: RoomId; to: RoomId }
  | {
      t: "conversation";
      week?: number;
      phase?: Phase;
      roomId: RoomId;
      participantIds: string[];
      turns: { speakerId: string; text: string }[];
      payload?: {
        intent?: string;
        allianceIds?: string[];
        dealIds?: string[];
        showmanceIds?: string[];
        witnessIds?: string[];
        blockedByIds?: string[];
      };
    }
  | { t: "confessional"; speakerId: string; text: string }
  | { t: "ceremony"; week: number; kind: CeremonyKind; payload: Record<string, unknown> }
  | { t: "vote"; week: number; voterId: string; targetId: string; confessional?: string; isTiebreaker?: boolean }
  | { t: "eviction"; week: number; evictedId: string; toJury: boolean; preEvictionHouseSize: number; jurorNumber?: number }
  | { t: "jury_vote"; jurorId: string; finalistId: string; reasoning: string };

export interface SeasonTape {
  state0: GameState;
  events: GameEvent[];
}
