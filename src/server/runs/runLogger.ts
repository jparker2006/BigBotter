import type { Phase } from "../../engine/types";

// One Haiku tool-use call: the prompt sent, the parsed decision returned, timing, and tokens.
export type AgentCallLog = {
  ts: number;
  durationMs: number;
  tool: string;
  actorId?: string;
  prompt: string;
  system: string;
  decision?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
  ok: boolean;
  error?: string;
};

// One engine phase transition.
export type TransitionLog = {
  step: number;
  phase: Phase;
  nextPhase: Phase;
  week: number;
  events: number;
  done: boolean;
};

export type LogEntry =
  | ({ kind: "agent" } & AgentCallLog)
  | ({ kind: "transition" } & TransitionLog);

export type RunLogger = {
  agentCall: (entry: AgentCallLog) => void;
  transition: (entry: TransitionLog) => void;
  entries: () => LogEntry[];
};

// Collects log entries in memory during a season run; the caller flushes them to disk once
// the season finishes (see runStore.saveRun). Cheap even for thousand-call Haiku seasons.
export function createRunLogger(): RunLogger {
  const entries: LogEntry[] = [];
  return {
    agentCall: (entry) => entries.push({ kind: "agent", ...entry }),
    transition: (entry) => entries.push({ kind: "transition", ...entry }),
    entries: () => entries,
  };
}
