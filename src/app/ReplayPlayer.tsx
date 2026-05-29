"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import type { GameEvent, RoomId, SeasonTape } from "../engine/types";
import type { RunMeta } from "../server/runs/runStore";
import { deleteSavedRun, generateReplayTape, listSavedRuns, loadSavedRun, narrateJulieLine } from "./actions";
import BroadcastStage from "./BroadcastStage";
import DebugLogPanel from "./DebugLogPanel";
import { buildReplayFrame, describeEvent, nameFor, type WallHouseguest } from "./replayModel";
import { useReplayStore } from "./replayStore";
import SavedRunsPanel from "./SavedRunsPanel";

const House3D = dynamic(() => import("./House3D"), {
  ssr: false,
  loading: () => <div className="h-[460px] rounded-[1.75rem] border border-cyan-200/20 bg-slate-950/80" />,
});

const ROOM_LABELS: Record<RoomId, string> = {
  hoh_room: "HOH Room",
  bedrooms: "Bedrooms",
  kitchen: "Kitchen",
  living_room: "Living Room",
  backyard: "Backyard",
  diary_room: "Diary Room",
  have_not_room: "Have-Not Room",
  storage: "Storage",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function eventLabel(event: GameEvent, tape: SeasonTape): string {
  if (event.t === "host") return event.text;
  if (event.t === "comp") return `${event.compType}: ${nameFor(tape, event.winnerId)} wins`;
  if (event.t === "conversation") return `${event.roomId}: ${event.participantIds.map((id) => nameFor(tape, id)).join(", ")}`;
  if (event.t === "movement") return `${nameFor(tape, event.hgId)} to ${event.to}`;
  if (event.t === "confessional") return `DR: ${nameFor(tape, event.speakerId)}`;
  if (event.t === "ceremony") return `${event.kind} ceremony`;
  if (event.t === "vote") return `${nameFor(tape, event.voterId)} votes`;
  if (event.t === "eviction") return `${nameFor(tape, event.evictedId)} evicted`;
  if (event.t === "jury_vote") return `${nameFor(tape, event.jurorId)} jury vote`;
  return "Tape event";
}

function MemoryCard({ houseguest, godMode }: { houseguest: WallHouseguest; godMode: boolean }) {
  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border p-3 shadow-xl transition ${
        houseguest.currentStatus === "active"
          ? "border-cyan-200/25 bg-slate-950/80"
          : "border-white/10 bg-slate-950/45 grayscale"
      }`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 via-slate-900 to-black">
        {houseguest.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={houseguest.portraitUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-black text-yellow-200">{initials(houseguest.name)}</div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {houseguest.isCurrentHoh ? <span className="status-badge status-badge-crown">HOH</span> : null}
          {houseguest.hasCurrentVeto ? <span className="status-badge status-badge-veto">V</span> : null}
        </div>
        {houseguest.isCurrentNominee ? <div className="block-ribbon">ON THE BLOCK</div> : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-2">
          <p className="truncate text-sm font-black text-white">{houseguest.name}</p>
          <p className="truncate text-[10px] uppercase tracking-[0.2em] text-cyan-100/70">{houseguest.archetype}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {houseguest.isCurrentHoh ? <span className="tag tag-gold">HOH</span> : null}
        {houseguest.isCurrentNominee ? <span className="tag tag-red">On Block</span> : null}
        {houseguest.hasCurrentVeto ? <span className="tag tag-blue">Veto</span> : null}
        {houseguest.currentStatus === "jury" ? <span className="tag tag-white">Juror {houseguest.jurorNumber}</span> : null}
        {houseguest.currentStatus === "evicted" ? <span className="tag tag-white">Evicted</span> : null}
      </div>
      {godMode ? (
        <div className="mt-3 grid grid-cols-4 gap-1 text-[10px] text-slate-300">
          <span>STR {houseguest.stats.strength}</span>
          <span>END {houseguest.stats.endurance}</span>
          <span>IQ {houseguest.stats.iq}</span>
          <span>MEM {houseguest.stats.memory}</span>
          <span>CHA {houseguest.stats.charisma}</span>
          <span>SPD {houseguest.stats.speed}</span>
          <span>LCK {houseguest.stats.luck}</span>
          <span>MOR {houseguest.morale}</span>
        </div>
      ) : null}
    </article>
  );
}

function predictionScore(houseguest: WallHouseguest): number {
  if (houseguest.currentStatus !== "active") return 0;
  return Math.round((houseguest.stats.charisma + houseguest.stats.iq + houseguest.stats.memory + houseguest.morale) / 4);
}

export default function ReplayPlayer() {
  const [seed, setSeed] = useState("222");
  const [useHaiku, setUseHaiku] = useState(false);
  const [tape, setTape] = useState<SeasonTape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loadedRunId, setLoadedRunId] = useState<string | null>(null);
  const [winnerPredictionId, setWinnerPredictionId] = useState("");
  const [evictionPredictionId, setEvictionPredictionId] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [isVoicing, startVoiceTransition] = useTransition();
  const [isPending, startTransition] = useTransition();
  const cursor = useReplayStore((state) => state.cursor);
  const isPlaying = useReplayStore((state) => state.isPlaying);
  const godMode = useReplayStore((state) => state.godMode);
  const setCursor = useReplayStore((state) => state.setCursor);
  const play = useReplayStore((state) => state.play);
  const pause = useReplayStore((state) => state.pause);
  const reset = useReplayStore((state) => state.reset);
  const rewind = useReplayStore((state) => state.rewind);
  const advance = useReplayStore((state) => state.advance);
  const toggleGodMode = useReplayStore((state) => state.toggleGodMode);

  useEffect(() => {
    if (!tape || !isPlaying) return;
    const timer = window.setInterval(() => advance(tape.events.length - 1), 950);
    return () => window.clearInterval(timer);
  }, [advance, isPlaying, tape]);

  useEffect(() => {
    listSavedRuns().then(setRuns).catch(() => setRuns([]));
  }, []);

  function applyLoadedTape(nextTape: SeasonTape, runId: string | null) {
    setTape(nextTape);
    setLoadedRunId(runId);
    setCursor(0);
    setWinnerPredictionId("");
    setEvictionPredictionId("");
    setVoiceStatus(null);
  }

  function generate() {
    setError(null);
    pause();
    startTransition(async () => {
      try {
        const parsedSeed = Number(seed);
        const { tape: nextTape, meta } = await generateReplayTape(Number.isInteger(parsedSeed) ? parsedSeed : Date.now(), useHaiku);
        applyLoadedTape(nextTape, meta.id);
        setRuns(await listSavedRuns());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to generate tape.");
      }
    });
  }

  function handleLoadRun(id: string) {
    setError(null);
    pause();
    startTransition(async () => {
      try {
        const { tape: nextTape } = await loadSavedRun(id);
        applyLoadedTape(nextTape, id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to load run.");
      }
    });
  }

  function handleDeleteRun(id: string) {
    startTransition(async () => {
      try {
        setRuns(await deleteSavedRun(id));
        if (loadedRunId === id) {
          setLoadedRunId(null);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to delete run.");
      }
    });
  }

  function playHostVoice() {
    if (!frame?.currentEvent || frame.currentEvent.t !== "host") {
      setVoiceStatus("Julie voice is available on host narration events.");
      return;
    }

    setVoiceStatus(null);
    const hostText = frame.currentEvent.text;
    startVoiceTransition(async () => {
      try {
        const result = await narrateJulieLine(hostText);
        if (!result.ok) {
          setVoiceStatus(result.message);
          return;
        }
        const audio = new Audio(result.audioDataUrl);
        await audio.play();
        setVoiceStatus("Playing generic host TTS.");
      } catch (caught) {
        setVoiceStatus(caught instanceof Error ? caught.message : "Failed to play host TTS.");
      }
    });
  }

  const frame = tape ? buildReplayFrame(tape, cursor) : null;
  const described = tape
    ? describeEvent(tape, frame?.currentEvent ?? null)
    : {
        kicker: "Ready",
        headline: "Generate a season, then press play.",
        body: "The replay is built from the same serializable tape the engine writes.",
      };
  const recentEvents = tape ? tape.events.slice(Math.max(0, cursor - 8), cursor + 1) : [];
  const progress = tape ? Math.round((cursor / Math.max(1, tape.events.length - 1)) * 100) : 0;
  const activeHouseguests = frame?.houseguests.filter((houseguest) => houseguest.currentStatus === "active") ?? [];
  const winnerPrediction = frame?.houseguests.find((houseguest) => houseguest.id === winnerPredictionId);
  const evictionPrediction = frame?.houseguests.find((houseguest) => houseguest.id === evictionPredictionId);

  return (
    <main className="min-h-screen overflow-hidden bg-[#041018] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_6%,rgba(250,204,21,.38),transparent_27%),radial-gradient(circle_at_78%_14%,rgba(34,211,238,.24),transparent_30%),linear-gradient(135deg,#020617_0%,#082f49_48%,#020617_100%)]" />
      <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid gap-4 rounded-[2rem] border border-white/15 bg-black/35 p-4 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_.9fr]">
          <div className="min-h-[360px] rounded-[1.5rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(8,47,73,.8),rgba(2,6,23,.92)),repeating-linear-gradient(90deg,rgba(255,255,255,.07)_0_1px,transparent_1px_80px)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.55em] text-yellow-300">Big Botter Live Tape</p>
                <h1 className="mt-3 max-w-4xl text-5xl font-black leading-none tracking-tight sm:text-7xl">
                  {described.headline}
                </h1>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-100/70">Week</p>
                <p className="text-4xl font-black text-yellow-200">{frame?.week ?? 1}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200">{described.kicker}</p>
                <p className="mt-4 text-2xl leading-9 text-slate-100">{described.body}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="stat-tile">
                  <span>Active</span>
                  <strong>{frame?.activeCount ?? 16}</strong>
                </div>
                <div className="stat-tile">
                  <span>Evicted</span>
                  <strong>{frame?.evictedCount ?? 0}</strong>
                </div>
                <div className="stat-tile">
                  <span>Jury</span>
                  <strong>{frame?.juryCount ?? 0}</strong>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-white/15 bg-slate-950/80 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-mono text-sm text-white outline-none ring-yellow-300/0 transition focus:ring-4"
                aria-label="Replay seed"
              />
              <button className="btn-primary" disabled={isPending} onClick={generate}>
                {isPending ? (useHaiku ? "Scheming…" : "Generating…") : tape ? "New Tape" : "Generate Tape"}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/80">AI Houseguests</p>
                <p className="text-[11px] leading-tight text-slate-400">
                  {useHaiku
                    ? "Haiku makes the real decisions, confessionals & scheming — takes a few minutes."
                    : "Off: instant deterministic placeholder season."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useHaiku}
                aria-label="Toggle AI houseguests"
                disabled={isPending}
                onClick={() => setUseHaiku((value) => !value)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${useHaiku ? "bg-cyan-400" : "bg-white/20"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${useHaiku ? "left-6" : "left-1"}`} />
              </button>
            </div>
            {error ? <p className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-100">{error}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-secondary" disabled={!tape || isPending} onClick={isPlaying ? pause : play}>
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button className="btn-secondary" disabled={!tape || isPending || cursor === 0} onClick={rewind}>
                Rewind
              </button>
              <button className="btn-secondary" disabled={!tape || isPending} onClick={reset}>
                Reset
              </button>
              <button className="btn-secondary" disabled={!tape || isPending} onClick={toggleGodMode}>
                {godMode ? "Hide God Mode" : "God Mode"}
              </button>
              <button className="btn-secondary" disabled={!tape || isPending || isVoicing} onClick={playHostVoice}>
                {isVoicing ? "Voicing..." : "Julie Voice"}
              </button>
            </div>
            {voiceStatus ? <p className="mt-3 rounded-xl border border-cyan-200/15 bg-cyan-200/10 p-3 text-sm text-cyan-50">{voiceStatus}</p> : null}
            {frame ? (
              <div className="prediction-panel mt-5">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-yellow-200">Cosmetic Predictions</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label>
                    <span>Winner pick</span>
                    <select value={winnerPredictionId} onChange={(event) => setWinnerPredictionId(event.target.value)}>
                      <option value="">No pick</option>
                      {activeHouseguests.map((houseguest) => (
                        <option key={houseguest.id} value={houseguest.id}>
                          {houseguest.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Next boot pick</span>
                    <select value={evictionPredictionId} onChange={(event) => setEvictionPredictionId(event.target.value)}>
                      <option value="">No pick</option>
                      {activeHouseguests.map((houseguest) => (
                        <option key={houseguest.id} value={houseguest.id}>
                          {houseguest.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                  <p>{winnerPrediction ? `Winner meter: ${predictionScore(winnerPrediction)}% for ${winnerPrediction.name}.` : "Winner pick has no gameplay effect."}</p>
                  <p>{evictionPrediction ? `Danger meter: ${100 - predictionScore(evictionPrediction)}% for ${evictionPrediction.name}.` : "Boot pick is for the viewer only."}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-6">
              <div className="flex justify-between text-xs uppercase tracking-[0.25em] text-slate-400">
                <span>Replay</span>
                <span>{tape ? `${cursor + 1}/${tape.events.length}` : "0/0"}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-cyan-300 to-white" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="mt-6 max-h-72 space-y-2 overflow-auto pr-1">
              {recentEvents.length === 0 ? (
                <p className="text-sm text-slate-400">Generate a tape to see the event log.</p>
              ) : (
                recentEvents.map((event, index) => (
                  <div
                    key={`${Math.max(0, cursor - 8) + index}-${event.t}`}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      index === recentEvents.length - 1 ? "border-yellow-200/50 bg-yellow-200/10" : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    {eventLabel(event, tape!)}
                  </div>
                ))
              )}
            </div>
            <SavedRunsPanel
              runs={runs}
              loadedRunId={loadedRunId}
              disabled={isPending}
              onLoad={handleLoadRun}
              onDelete={handleDeleteRun}
            />
          </aside>
        </section>

        {frame ? (
          <section className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <BroadcastStage tape={tape!} frame={frame} />
              <House3D frame={frame} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-[2rem] border border-white/15 bg-black/40 p-4 shadow-2xl backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-2xl font-black">Memory Wall</h2>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Portraits + status</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  {frame.houseguests.map((houseguest) => (
                    <MemoryCard key={houseguest.id} houseguest={houseguest} godMode={godMode} />
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/15 bg-black/40 p-4 shadow-2xl backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-2xl font-black">House Map</h2>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Room positions</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(frame.rooms).map(([roomId, houseguests]) => (
                    <section key={roomId} className="min-h-32 rounded-2xl border border-cyan-200/15 bg-slate-950/70 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-black">{ROOM_LABELS[roomId as RoomId]}</h3>
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{houseguests.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {houseguests.map((houseguest) => (
                          <span
                            key={houseguest.id}
                            className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-100"
                          >
                            {houseguest.name.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>

            {godMode ? <DebugLogPanel key={loadedRunId ?? "none"} runId={loadedRunId} /> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
