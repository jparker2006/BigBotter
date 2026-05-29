"use client";

import type { GameEvent, SeasonTape } from "../engine/types";
import { describeEvent, nameFor, type ReplayFrame, type WallHouseguest } from "./replayModel";

function featuredIds(event: GameEvent | null): string[] {
  if (!event) return [];
  if (event.t === "comp") return [event.winnerId, ...event.playerIds.filter((id) => id !== event.winnerId).slice(0, 2)];
  if (event.t === "conversation") return event.participantIds.slice(0, 4);
  if (event.t === "movement") return [event.hgId];
  if (event.t === "confessional") return [event.speakerId];
  if (event.t === "ceremony") {
    const nomineeIds = event.payload.nomineeIds as string[] | undefined;
    const evictedId = event.payload.evictedId as string | undefined;
    return [...(nomineeIds ?? []), ...(evictedId ? [evictedId] : [])].slice(0, 4);
  }
  if (event.t === "vote") return [event.voterId, event.targetId];
  if (event.t === "eviction") return [event.evictedId];
  if (event.t === "jury_vote") return [event.jurorId, event.finalistId];
  return [];
}

function eventMode(event: GameEvent | null): "ceremony" | "live" | "diary" | "feeds" | "comp" {
  if (!event) return "live";
  if (event.t === "ceremony" || event.t === "eviction" || event.t === "vote" || event.t === "jury_vote") return "ceremony";
  if (event.t === "confessional") return "diary";
  if (event.t === "conversation" || event.t === "movement") return "feeds";
  if (event.t === "comp") return "comp";
  return "live";
}

function houseguestById(frame: ReplayFrame, id: string): WallHouseguest | undefined {
  return frame.houseguests.find((houseguest) => houseguest.id === id);
}

export default function BroadcastStage({ tape, frame }: { tape: SeasonTape; frame: ReplayFrame }) {
  const event = frame.currentEvent;
  const described = describeEvent(tape, event);
  const mode = eventMode(event);
  const featured = featuredIds(event)
    .map((id) => houseguestById(frame, id))
    .filter((houseguest): houseguest is WallHouseguest => Boolean(houseguest));

  return (
    <section className={`broadcast-stage broadcast-stage-${mode}`}>
      <div className="eye-mark" aria-hidden="true">
        <span />
      </div>
      <div className="broadcast-copy">
        <p>{mode === "ceremony" ? "Eviction Night" : mode === "feeds" ? "Live Feed" : mode === "diary" ? "Diary Room" : mode === "comp" ? "Competition" : "Broadcast"}</p>
        <h2>{described.headline}</h2>
        <span>{described.body}</span>
      </div>
      <div className="stage-pedestals">
        {featured.length === 0 ? (
          <div className="empty-pedestal">Generate a tape to light the stage.</div>
        ) : (
          featured.map((houseguest) => (
            <article key={houseguest.id} className="stage-card">
              <div className="stage-portrait">
                {houseguest.portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={houseguest.portraitUrl} alt="" />
                ) : (
                  <strong>{houseguest.name.slice(0, 1)}</strong>
                )}
              </div>
              <div>
                <b>{nameFor(tape, houseguest.id)}</b>
                <small>{houseguest.archetype}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
