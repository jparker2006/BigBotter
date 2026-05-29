export const CAST_SIZE = 16;
export const JURY_THRESHOLD = 9;
export const VETO_PLAYERS = 6;
export const HAVE_NOT_COUNT = 3;
export const HAVE_NOT_PHASEOUT_SIZE = 5;
export const DOUBLE_EVICTION_AT_HOUSE_SIZE = 8;

export const MIN_STAT = 1;
export const MAX_STAT = 100;
export const MIN_MORALE = 0;
export const MAX_MORALE = 100;

export const MORALE = {
  WIN_HOH: 12,
  WIN_VETO: 10,
  SAVED_BY_VETO: 8,
  NOMINATED: -10,
  SURVIVE_BLOCK: 5,
  SURVIVE_WEEK: 2,
  HAVE_NOT: -15,
} as const;

// Social scheming volume caps — keep AI seasons affordable/fast (the dialogue calls dominate
// cost + latency). Conversations per scheme window scale with house size up to the cap.
export const SOCIAL = {
  MAX_CONVERSATIONS_PER_WINDOW: 3,
  CONVERSATION_DIVISOR: 5, // conversations ≈ ceil(activeCount / divisor), capped above
  MAX_TURNS_PER_CONVERSATION: 3,
} as const;

