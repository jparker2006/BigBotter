import type { GameEvent, Houseguest, RoomId, SeasonTape } from "../engine/types";

export type WallHouseguest = Houseguest & {
  currentStatus: "active" | "evicted" | "jury";
  isCurrentHoh: boolean;
  isCurrentNominee: boolean;
  hasCurrentVeto: boolean;
  currentLocation: RoomId;
  jurorNumber?: number;
};

export type ReplayFrame = {
  currentEvent: GameEvent | null;
  week: number;
  houseguests: WallHouseguest[];
  rooms: Record<RoomId, WallHouseguest[]>;
  activeCount: number;
  evictedCount: number;
  juryCount: number;
  hohId: string | null;
  nomineeIds: string[];
  vetoHolderId: string | null;
};

const ROOMS: RoomId[] = ["hoh_room", "bedrooms", "kitchen", "living_room", "backyard", "diary_room", "have_not_room", "storage"];

export function nameFor(tape: SeasonTape, id: string): string {
  return tape.state0.houseguests.find((houseguest) => houseguest.id === id)?.name ?? id;
}

export function describeEvent(tape: SeasonTape, event: GameEvent | null): { kicker: string; headline: string; body: string } {
  if (!event) {
    return {
      kicker: "Ready",
      headline: "Generate a season, then press play.",
      body: "The replay is built from the same serializable tape the engine writes.",
    };
  }

  if (event.t === "host") {
    return { kicker: "Julie", headline: event.text, body: "Host narration" };
  }
  if (event.t === "comp") {
    return {
      kicker: `${event.phase} / ${event.compType}`,
      headline: `${nameFor(tape, event.winnerId)} wins ${event.title ?? event.compType}.`,
      body: event.rounds[0]?.question ?? event.narration ?? `${event.playerIds.length} players competed.`,
    };
  }
  if (event.t === "conversation") {
    return {
      kicker: `${event.roomId} / ${event.payload?.intent ?? "conversation"}`,
      headline: event.participantIds.map((id) => nameFor(tape, id)).join(", "),
      body: event.turns.at(-1)?.text ?? "A quiet game talk unfolds.",
    };
  }
  if (event.t === "movement") {
    return {
      kicker: "Movement",
      headline: `${nameFor(tape, event.hgId)} moves to ${event.to.replaceAll("_", " ")}.`,
      body: `From ${event.from.replaceAll("_", " ")}.`,
    };
  }
  if (event.t === "confessional") {
    return { kicker: "Diary Room", headline: nameFor(tape, event.speakerId), body: event.text };
  }
  if (event.t === "ceremony") {
    const nomineeIds = event.payload.nomineeIds as string[] | undefined;
    return {
      kicker: `${event.kind} ceremony`,
      headline:
        event.kind === "nomination"
          ? `${nomineeIds?.map((id) => nameFor(tape, id)).join(" and ")} hit the block.`
          : event.kind === "veto"
            ? `Veto ${event.payload.used ? "used" : "not used"}.`
            : `${nameFor(tape, event.payload.evictedId as string)} is evicted.`,
      body: nomineeIds?.map((id) => nameFor(tape, id)).join(" vs ") ?? "Ceremony",
    };
  }
  if (event.t === "vote") {
    return {
      kicker: event.isTiebreaker ? "HOH tiebreaker" : "Vote",
      headline: `${nameFor(tape, event.voterId)} votes to evict ${nameFor(tape, event.targetId)}.`,
      body: event.confessional ?? "Vote locked.",
    };
  }
  if (event.t === "eviction") {
    return {
      kicker: event.toJury ? `Juror #${event.jurorNumber}` : "Eviction",
      headline: `${nameFor(tape, event.evictedId)} leaves the house.`,
      body: `House size: ${event.preEvictionHouseSize - 1}`,
    };
  }
  if (event.t === "jury_vote") {
    return {
      kicker: "Finale vote",
      headline: `${nameFor(tape, event.jurorId)} votes for ${nameFor(tape, event.finalistId)}.`,
      body: event.reasoning,
    };
  }

  return { kicker: "Tape", headline: "Event", body: JSON.stringify(event) };
}

export function buildReplayFrame(tape: SeasonTape, cursor: number): ReplayFrame {
  const events = tape.events.slice(0, cursor + 1);
  const currentEvent = tape.events[cursor] ?? null;
  const evicted = new Map<string, { status: "evicted" | "jury"; jurorNumber?: number }>();
  const locations = new Map<string, RoomId>();
  let hohId: string | null = null;
  let nomineeIds: string[] = [];
  let vetoHolderId: string | null = null;
  // Carry the week forward from the last event that has one — confessional/movement/jury_vote
  // events have no week field, so reading the current event alone made the UI flash "Week 1".
  let week = 1;

  for (const houseguest of tape.state0.houseguests) {
    locations.set(houseguest.id, houseguest.location);
  }

  for (const event of events) {
    if ("week" in event && typeof event.week === "number") {
      week = event.week;
    }
    if (event.t === "comp" && event.phase === "hoh_comp") {
      hohId = event.winnerId;
      nomineeIds = [];
      vetoHolderId = null;
    }
    if (event.t === "comp" && event.phase === "veto_comp") {
      vetoHolderId = event.winnerId;
    }
    if (event.t === "movement") {
      locations.set(event.hgId, event.to);
    }
    if (event.t === "ceremony" && event.kind === "nomination") {
      nomineeIds = [...((event.payload.nomineeIds as string[] | undefined) ?? [])];
    }
    if (event.t === "ceremony" && event.kind === "veto") {
      nomineeIds = [...((event.payload.nomineeIds as string[] | undefined) ?? nomineeIds)];
    }
    if (event.t === "eviction") {
      evicted.set(event.evictedId, { status: event.toJury ? "jury" : "evicted", jurorNumber: event.jurorNumber });
      nomineeIds = nomineeIds.filter((id) => id !== event.evictedId);
      if (hohId === event.evictedId) {
        hohId = null;
      }
      if (vetoHolderId === event.evictedId) {
        vetoHolderId = null;
      }
    }
  }

  const houseguests = tape.state0.houseguests.map((houseguest): WallHouseguest => {
    const eviction = evicted.get(houseguest.id);
    return {
      ...houseguest,
      currentStatus: eviction?.status ?? "active",
      isCurrentHoh: houseguest.id === hohId && !eviction,
      isCurrentNominee: nomineeIds.includes(houseguest.id) && !eviction,
      hasCurrentVeto: houseguest.id === vetoHolderId && !eviction,
      currentLocation: locations.get(houseguest.id) ?? houseguest.location,
      jurorNumber: eviction?.jurorNumber,
    };
  });

  const rooms = Object.fromEntries(ROOMS.map((room) => [room, [] as WallHouseguest[]])) as Record<RoomId, WallHouseguest[]>;
  for (const houseguest of houseguests) {
    if (houseguest.currentStatus === "active") {
      rooms[houseguest.currentLocation].push(houseguest);
    }
  }

  return {
    currentEvent,
    week,
    houseguests,
    rooms,
    activeCount: houseguests.filter((houseguest) => houseguest.currentStatus === "active").length,
    evictedCount: houseguests.filter((houseguest) => houseguest.currentStatus !== "active").length,
    juryCount: houseguests.filter((houseguest) => houseguest.currentStatus === "jury").length,
    hohId,
    nomineeIds,
    vetoHolderId,
  };
}
