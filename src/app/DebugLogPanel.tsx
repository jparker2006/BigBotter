"use client";

import { useState } from "react";
import type { LogEntry } from "../server/runs/runLogger";
import { loadSavedRunLog } from "./actions";

const MAX_ROWS = 200;

function summarizeDecision(decision: unknown): string {
  if (decision == null) return "";
  try {
    return JSON.stringify(decision).slice(0, 140);
  } catch {
    return String(decision).slice(0, 140);
  }
}

function LogRow({ entry }: { entry: LogEntry }) {
  if (entry.kind === "transition") {
    return (
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5 text-[11px]">
        <span className="w-16 shrink-0 font-black uppercase tracking-wider text-slate-500">step</span>
        <span className="text-cyan-100/80">
          {entry.phase} → {entry.nextPhase}
        </span>
        <span className="ml-auto text-slate-500">
          wk{entry.week} · {entry.events} ev{entry.done ? " · done" : ""}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-2 border-b border-white/5 px-3 py-1.5 text-[11px] ${entry.ok ? "" : "bg-red-500/10"}`}>
      <span className="w-16 shrink-0 font-black uppercase tracking-wider text-yellow-200/80">{entry.ok ? "haiku" : "error"}</span>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-cyan-200">{entry.tool}</span>{" "}
        <span className="text-slate-300">{entry.ok ? summarizeDecision(entry.decision) : entry.error}</span>
      </div>
      <span className="ml-auto shrink-0 text-slate-500">{Math.round(entry.durationMs)}ms</span>
    </div>
  );
}

export default function DebugLogPanel({ runId }: { runId: string | null }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await loadSavedRunLog(runId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load debug log.");
    } finally {
      setLoading(false);
    }
  }

  const agentCalls = entries?.filter((entry) => entry.kind === "agent") ?? [];
  const transitions = entries?.filter((entry) => entry.kind === "transition") ?? [];
  const errors = agentCalls.filter((entry) => entry.kind === "agent" && !entry.ok);

  return (
    <div className="rounded-[2rem] border border-white/15 bg-black/40 p-4 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black">Debug Log</h2>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Agent calls + transitions</p>
      </div>

      {!entries ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={!runId || loading}
          onClick={load}
        >
          {loading ? "Loading…" : "Load debug log"}
        </button>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            <strong className="text-cyan-200">{agentCalls.length}</strong> agent calls ·{" "}
            <strong className="text-cyan-200">{transitions.length}</strong> transitions
            {errors.length > 0 ? (
              <>
                {" "}
                · <strong className="text-red-300">{errors.length}</strong> errors
              </>
            ) : null}
          </p>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No log entries (random runs make no agent calls).</p>
          ) : (
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-white/10 bg-slate-950/60 font-mono">
              {entries.slice(-MAX_ROWS).map((entry, index) => (
                <LogRow key={index} entry={entry} />
              ))}
            </div>
          )}
          {entries.length > MAX_ROWS ? (
            <p className="mt-2 text-[11px] text-slate-500">Showing the last {MAX_ROWS} of {entries.length} entries.</p>
          ) : null}
        </>
      )}
      {error ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</p> : null}
    </div>
  );
}
