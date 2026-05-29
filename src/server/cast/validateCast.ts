import { MAX_STAT, MIN_STAT } from "../../engine/constants";
import type { Houseguest, Notebook, RoomId, StatKey, Stats } from "../../engine/types";

const STAT_KEYS: StatKey[] = ["strength", "endurance", "agility", "speed", "iq", "memory", "charisma", "luck"];
const ROOMS: RoomId[] = ["bedrooms", "kitchen", "living_room", "backyard", "storage"];

function emptyNotebook(): Notebook {
  return {
    relationships: {},
    allianceIds: [],
    targetIds: [],
    deals: [],
    secretsKnown: [],
    reads: [],
    grudges: [],
    memoryLog: [],
  };
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid cast field: ${field}`);
  }
  return value.trim();
}

function asNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid cast field: ${field}`);
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeStats(value: unknown, index: number): Stats {
  if (!value || typeof value !== "object") {
    throw new Error(`Houseguest ${index + 1} is missing stats.`);
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, asNumber(source[key], `houseguests[${index}].stats.${key}`, MIN_STAT, MAX_STAT)]),
  ) as Stats;
}

function normalizeHouseguest(value: unknown, index: number): Houseguest {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid houseguest at index ${index}.`);
  }
  const source = value as Record<string, unknown>;
  const id = `hg${String(index + 1).padStart(2, "0")}`;

  return {
    id,
    name: asString(source.name, `houseguests[${index}].name`),
    age: asNumber(source.age, `houseguests[${index}].age`, 21, 75),
    occupation: asString(source.occupation, `houseguests[${index}].occupation`),
    hometown: asString(source.hometown, `houseguests[${index}].hometown`),
    bio: asString(source.bio, `houseguests[${index}].bio`),
    personality: asString(source.personality, `houseguests[${index}].personality`),
    talkingStyle: asString(source.talkingStyle, `houseguests[${index}].talkingStyle`),
    archetype: asString(source.archetype, `houseguests[${index}].archetype`),
    stats: normalizeStats(source.stats, index),
    morale: asNumber(source.morale ?? 70, `houseguests[${index}].morale`, 0, 100),
    portraitUrl: typeof source.portraitUrl === "string" ? source.portraitUrl : "",
    status: "active",
    isHOH: false,
    isNominated: false,
    hasVeto: false,
    isHaveNot: false,
    location: ROOMS[index % ROOMS.length]!,
    notebook: emptyNotebook(),
  };
}

export function normalizeCastResponse(value: unknown): Houseguest[] {
  if (!value || typeof value !== "object") {
    throw new Error("Cast response must be a JSON object.");
  }
  const houseguests = (value as { houseguests?: unknown }).houseguests;
  if (!Array.isArray(houseguests) || houseguests.length !== 16) {
    throw new Error("Cast response must include exactly 16 houseguests.");
  }

  const normalized = houseguests.map(normalizeHouseguest);
  const names = new Set(normalized.map((houseguest) => houseguest.name.toLowerCase()));
  if (names.size !== normalized.length) {
    throw new Error("Cast response contains duplicate names.");
  }
  const archetypes = new Set(normalized.map((houseguest) => houseguest.archetype.toLowerCase()));
  if (archetypes.size < 7) {
    throw new Error("Cast response needs stronger archetype variety.");
  }
  return normalized;
}

