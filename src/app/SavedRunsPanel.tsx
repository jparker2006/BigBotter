"use client";

import type { RunMeta } from "../server/runs/runStore";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SavedRunsPanel({
  runs,
  loadedRunId,
  disabled,
  onLoad,
  onDelete,
}: {
  runs: RunMeta[];
  loadedRunId: string | null;
  disabled: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-200">Saved Runs</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <p className="mt-3 text-[11px] text-slate-400">No saved runs yet — every season you generate is saved here to re-watch.</p>
      ) : (
        <ul className="mt-3 max-h-60 space-y-2 overflow-auto pr-1">
          {runs.map((run) => {
            const active = run.id === loadedRunId;
            return (
              <li
                key={run.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  active ? "border-yellow-200/50 bg-yellow-200/10" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onLoad(run.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        run.mode === "haiku" ? "bg-cyan-400/20 text-cyan-100" : "bg-white/15 text-slate-200"
                      }`}
                    >
                      {run.mode === "haiku" ? "AI" : "Random"}
                    </span>
                    <span className="truncate text-sm font-bold text-white">
                      {run.winnerName ? `🏆 ${run.winnerName}` : "Season"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-400">
                    seed {run.seed} · {run.weeks}wk · {run.eventCount} events
                    {run.logEntries > 0 ? ` · ${run.logEntries} log` : ""} · {formatWhen(run.savedAt)}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDelete(run.id)}
                  aria-label={`Delete run ${run.id}`}
                  className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 transition hover:border-red-400/40 hover:text-red-200"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
