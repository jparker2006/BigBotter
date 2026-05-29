import type { AgentDecider } from "./agents/decider";
import type { GameEvent, GameState } from "./types";
import { getHouseguest } from "./selectors";

export function rememberPublic(state: GameState, text: string): void {
  state.publicHistory.push(text);
  state.publicHistory = state.publicHistory.slice(-80);
}

function fallbackHost(beat: string, text: string): string {
  const prefix: Record<string, string> = {
    hoh: "Houseguests, the power has shifted.",
    nominations: "It is nomination time.",
    veto: "The Power of Veto has spoken.",
    eviction: "By the end of tonight, another dream ends.",
    finale: "After a summer of secrets, one player is about to win.",
    double_eviction: "Houseguests, buckle up. Tonight is a double eviction.",
  };
  return `${prefix[beat] ?? "But first."} ${text}`;
}

export async function hostEvent(
  state: GameState,
  decider: AgentDecider,
  beat: string,
  text: string,
  focusIds: string[] = [],
  payload?: unknown,
): Promise<GameEvent> {
  let narrated = fallbackHost(beat, text);
  if (decider.hostNarration) {
    try {
      narrated = await decider.hostNarration({ state, beat, text, focusIds });
    } catch {
      narrated = fallbackHost(beat, text);
    }
  }
  return { t: "host", week: state.week, text: narrated, payload };
}

function fallbackConfessional(state: GameState, actorId: string, reason: string): string {
  const actor = getHouseguest(state, actorId);
  const mood = actor.morale < 45 ? "I am running on fumes" : actor.morale > 80 ? "I feel dangerous right now" : "I have to stay sharp";
  const context: Record<string, string> = {
    hoh_win: "Power is cute, but blood is a permanent accessory.",
    nomination: "If I am on the block, everybody's handshake suddenly looks like a knife.",
    veto_win: "That veto medallion is not jewelry. It is leverage.",
    veto_ceremony: "This is where people find out whether my promises were strategy or decoration.",
    eviction_vote: "The vote is simple. The consequences are not.",
    evicted: "I am smiling because the alternative is committing a felony on live television.",
    finalist: "The jury can call it bitter. I call it evidence.",
  };
  return `${mood}. ${context[reason] ?? "This house is a mess, and somehow I am still in it."}`;
}

export async function confessionalText(
  state: GameState,
  decider: AgentDecider,
  actorId: string,
  reason: string,
  legalIds: string[] = [],
): Promise<string> {
  let text = fallbackConfessional(state, actorId, reason);
  if (decider.confessional) {
    try {
      const generated = await decider.confessional({
        state,
        actorId,
        legalIds,
        reason,
      });
      if (generated.trim()) {
        text = generated.trim().slice(0, 700);
      }
    } catch {
      text = fallbackConfessional(state, actorId, reason);
    }
  }
  return text;
}

export async function confessionalEvent(
  state: GameState,
  decider: AgentDecider,
  actorId: string,
  reason: string,
  legalIds: string[] = [],
): Promise<GameEvent> {
  const text = await confessionalText(state, decider, actorId, reason, legalIds);
  return { t: "confessional", speakerId: actorId, text };
}
