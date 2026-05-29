import { CAST_SIZE } from "./constants";
import type { GameState, Houseguest, RoomId, Stats } from "./types";
import type { Rng } from "./rng";
import { emptyNotebook, ensureAllNotebooks } from "./social/notebook";

const ROOMS: RoomId[] = ["bedrooms", "kitchen", "living_room", "backyard", "storage"];

const ARCHETYPES = [
  "villain",
  "floater",
  "loyalist",
  "chaos agent",
  "social butterfly",
  "comp beast",
  "mastermind-who-is-actually-bad",
  "underdog",
];

const OCCUPATIONS = [
  "bartender",
  "teacher",
  "personal trainer",
  "sales rep",
  "nurse",
  "software engineer",
  "chef",
  "event planner",
];

function stat(rng: Rng): number {
  return rng.int(28, 92);
}

function makeStats(rng: Rng, archetype: string): Stats {
  const stats: Stats = {
    strength: stat(rng),
    endurance: stat(rng),
    agility: stat(rng),
    speed: stat(rng),
    iq: stat(rng),
    memory: stat(rng),
    charisma: stat(rng),
    luck: stat(rng),
  };

  if (archetype === "comp beast") {
    stats.strength = Math.min(100, stats.strength + 18);
    stats.endurance = Math.min(100, stats.endurance + 18);
    stats.speed = Math.min(100, stats.speed + 10);
  }
  if (archetype === "mastermind-who-is-actually-bad") {
    stats.iq = Math.min(100, stats.iq + 18);
    stats.memory = Math.min(100, stats.memory + 10);
    stats.charisma = Math.max(1, stats.charisma - 10);
  }
  if (archetype === "social butterfly") {
    stats.charisma = Math.min(100, stats.charisma + 22);
  }
  if (archetype === "floater") {
    stats.luck = Math.min(100, stats.luck + 15);
  }

  return stats;
}

export function makeCast(rng: Rng): Houseguest[] {
  return Array.from({ length: CAST_SIZE }, (_, index) => {
    const id = `hg${String(index + 1).padStart(2, "0")}`;
    const archetype = ARCHETYPES[index % ARCHETYPES.length]!;
    const name = `HG${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      name,
      age: rng.int(22, 48),
      occupation: rng.pick(OCCUPATIONS),
      hometown: "Placeholder, USA",
      bio: `${name} is a placeholder houseguest for the deterministic engine.`,
      personality: archetype,
      talkingStyle: "direct reality-TV shorthand",
      archetype,
      stats: makeStats(rng, archetype),
      morale: rng.int(60, 80),
      portraitUrl: "",
      status: "active",
      isHOH: false,
      isNominated: false,
      hasVeto: false,
      isHaveNot: false,
      location: rng.pick(ROOMS),
      notebook: emptyNotebook(),
    };
  });
}

export function createInitialState(seed: number, rng: Rng): GameState {
  return createInitialStateFromCast(seed, makeCast(rng));
}

export function createInitialStateFromCast(seed: number, houseguests: Houseguest[]): GameState {
  const state: GameState = {
    seasonId: `season-${seed}`,
    seed,
    week: 1,
    phase: "hoh_comp",
    isDoubleEviction: false,
    houseguests: houseguests.map((houseguest) => ({
      ...houseguest,
      status: "active",
      isHOH: false,
      isNominated: false,
      hasVeto: false,
      isHaveNot: false,
    })),
    hohId: null,
    nomineeIds: [],
    vetoHolderId: null,
    replacementNomId: null,
    alliances: [],
    juryIds: [],
    haveNotIds: [],
    haveNotMoraleDeltas: {},
    doubleEvictionRemaining: 0,
    usedCompTypes: [],
  };
  ensureAllNotebooks(state);
  return state;
}
