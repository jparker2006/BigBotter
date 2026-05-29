import type { GameState } from "../../../engine/types";
import { step } from "../../../engine/stepper";
import { TapeWriter } from "../../../engine/tape";
import { persistRun, prepareSeason, type SeasonContext } from "../../../server/runs/generation";

// Long-running streaming generation — never statically optimized, and allowed to run for a
// full AI season (thousands of Haiku calls) without a route timeout.
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// Streams a season as newline-delimited JSON so the client can start watching week 1 while the
// rest generates: { t:"state0" } → many { t:"step", events } → { t:"done", meta } | { t:"error" }.
//
// Robustness (an AI run can cost real money): the run is checkpointed to disk every week and the
// generation loop keeps running + saving even if the browser disconnects, so an interrupted run
// is never lost.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { seed?: number; useHaiku?: boolean };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the client leaves, enqueue throws — flip a flag and keep generating + checkpointing
      // (just stop streaming). Generation is decoupled from the connection on purpose.
      let clientGone = false;
      const send = (chunk: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        } catch {
          clientGone = true;
        }
      };

      let ctx: SeasonContext | undefined;
      let tape: TapeWriter | undefined;
      try {
        ctx = prepareSeason(Number(body.seed), Boolean(body.useHaiku));
        send({ t: "state0", state0: ctx.state0, mode: ctx.mode, runId: ctx.id });

        tape = new TapeWriter(ctx.state0);
        let state: GameState = ctx.state0;
        let done = false;
        let guard = 0;
        let lastSavedWeek = 0;
        while (!done) {
          guard += 1;
          if (guard > 500) {
            throw new Error("Season did not terminate within 500 steps.");
          }
          const phase = state.phase;
          const week = state.week;
          const result = await step(state, { rng: ctx.rng, decider: ctx.decider });
          state = result.state;
          done = result.done;
          tape.appendMany(result.events);
          ctx.logger.transition({ step: guard, phase, nextPhase: state.phase, week, events: result.events.length, done });
          send({ t: "step", events: result.events, week: state.week, phase: state.phase, done });

          // Checkpoint after each week boundary so a crash/disconnect leaves a re-watchable run.
          if (state.week > lastSavedWeek) {
            persistRun(ctx, tape.build(), false);
            lastSavedWeek = state.week;
          }
        }

        const meta = persistRun(ctx, tape.build(), true);
        send({ t: "done", meta });
      } catch (error) {
        // Save whatever generated so the spend isn't wasted, then report the failure.
        if (ctx && tape) {
          try {
            persistRun(ctx, tape.build(), false);
          } catch {
            /* best-effort */
          }
        }
        send({ t: "error", message: error instanceof Error ? error.message : "Generation failed." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed (client gone) */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
