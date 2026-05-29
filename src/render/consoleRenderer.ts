import type { GameEvent, SeasonTape } from "../engine/types";

function name(tape: SeasonTape, id: string): string {
  return tape.state0.houseguests.find((houseguest) => houseguest.id === id)?.name ?? id;
}

type CeremonyEvent = Extract<GameEvent, { t: "ceremony" }>;

function voteLine(tape: SeasonTape, event: CeremonyEvent): string {
  const counts = event.payload.voteCounts as Record<string, number> | undefined;
  const evictedId = event.payload.evictedId as string;
  if (!counts) {
    return `${name(tape, evictedId)} is evicted.`;
  }
  const nominees = event.payload.nomineeIds as string[];
  const rendered = nominees.map((id) => `${counts[id] ?? 0} ${name(tape, id)}`).join(", ");
  if (event.payload.finalFourSoleVote) {
    return `Final 4 sole vote: ${name(tape, evictedId)} is evicted.`;
  }
  return `By a vote of ${rendered}, ${name(tape, evictedId)} is evicted${event.payload.tied ? " after an HOH tiebreaker" : ""}.`;
}

export function renderConsoleTape(tape: SeasonTape): string[] {
  const lines: string[] = [`Big Botter seed: ${tape.state0.seed}`];
  let currentWeek = 0;

  for (const event of tape.events) {
    if ("week" in event && typeof event.week === "number" && event.week !== currentWeek) {
      currentWeek = event.week;
      lines.push("");
      lines.push(`=== Week ${currentWeek} ===`);
    }

    if (event.t === "host") {
      lines.push(event.text);
      continue;
    }

    if (event.t === "comp") {
      const players = event.playerIds.map((id) => name(tape, id)).join(", ");
      const winner = name(tape, event.winnerId);
      lines.push(`${event.phase}: ${event.compType} (${players}) -> ${winner}`);
      if (event.rounds.length > 1) {
        for (const round of event.rounds) {
          lines.push(`  Round ${round.round}: eliminated ${round.eliminatedId ? name(tape, round.eliminatedId) : "none"}`);
        }
      }
      continue;
    }

    if (event.t === "movement") {
      lines.push(`${name(tape, event.hgId)} moves from ${event.from} to ${event.to}.`);
      continue;
    }

    if (event.t === "conversation") {
      const people = event.participantIds.map((id) => name(tape, id)).join(", ");
      const intent = event.payload?.intent ? ` (${event.payload.intent})` : "";
      lines.push(`Conversation in ${event.roomId}${intent}: ${people}`);
      for (const turn of event.turns) {
        lines.push(`  ${name(tape, turn.speakerId)}: ${turn.text}`);
      }
      if (event.payload?.allianceIds?.length) {
        lines.push(`  Alliances formed: ${event.payload.allianceIds.join(", ")}`);
      }
      if (event.payload?.dealIds?.length) {
        lines.push(`  Deals made: ${event.payload.dealIds.join(", ")}`);
      }
      if (event.payload?.showmanceIds?.length) {
        lines.push(`  Showmance signal: ${event.payload.showmanceIds.join(", ")}`);
      }
      continue;
    }

    if (event.t === "ceremony") {
      if (event.kind === "nomination") {
        const nomineeIds = event.payload.nomineeIds as string[];
        lines.push(`Nomination ceremony: ${nomineeIds.map((id) => name(tape, id)).join(" and ")} hit the block.`);
      }
      if (event.kind === "veto") {
        const used = event.payload.used ? "used" : "not used";
        const nomineeIds = event.payload.nomineeIds as string[];
        lines.push(`Veto ceremony: veto ${used}; final nominees are ${nomineeIds.map((id) => name(tape, id)).join(" and ")}.`);
      }
      if (event.kind === "eviction") {
        lines.push(voteLine(tape, event));
      }
      continue;
    }

    if (event.t === "vote") {
      lines.push(
        `${event.isTiebreaker ? "HOH tiebreaker" : "Vote"}: ${name(tape, event.voterId)} votes to evict ${name(
          tape,
          event.targetId,
        )}.`,
      );
      continue;
    }

    if (event.t === "eviction") {
      const juror = event.toJury ? ` JUROR #${event.jurorNumber}` : "";
      lines.push(`${name(tape, event.evictedId)} leaves the house.${juror} Post-eviction house size: ${event.preEvictionHouseSize - 1}.`);
      continue;
    }

    if (event.t === "jury_vote") {
      lines.push(`Jury vote: ${name(tape, event.jurorId)} votes for ${name(tape, event.finalistId)}.`);
    }
  }

  const evictions = tape.events.filter((event) => event.t === "eviction").length;
  const jurors = tape.events.filter((event) => event.t === "eviction" && event.toJury).length;
  const winner = tape.events.find(
    (event): event is Extract<GameEvent, { t: "host" }> =>
      event.t === "host" && (event.payload as { kind?: string } | undefined)?.kind === "winner",
  );
  const winnerId = (winner?.payload as { winnerId?: string } | undefined)?.winnerId;
  lines.push("");
  lines.push(`${evictions} evictions, ${jurors} jurors, ${winnerId ? `1 winner (${name(tape, winnerId)})` : "0 winners"}`);
  return lines;
}
