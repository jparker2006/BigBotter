import { step } from "../../../engine/stepper";
import { TapeWriter } from "../../../engine/tape";
import { finalizeRun, prepareSeason } from "../../../server/runs/generation";

// Long-running streaming generation — never statically optimized, and allowed to run for a
// full AI season (thousands of Haiku calls) without a route timeout.
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

// Streams a season as newline-delimited JSON so the client can start watching week 1 while the
// rest generates: { t:"state0" } → many { t:"step", events } → { t:"done", meta } | { t:"error" }.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { seed?: number; useHaiku?: boolean };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      try {
        const ctx = prepareSeason(Number(body.seed), Boolean(body.useHaiku));
        send({ t: "state0", state0: ctx.state0, mode: ctx.mode });

        const tape = new TapeWriter(ctx.state0);
        let state = ctx.state0;
        let done = false;
        let guard = 0;
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
        }

        const meta = finalizeRun({ tape: tape.build(), mode: ctx.mode, log: ctx.logger.entries() });
        send({ t: "done", meta });
      } catch (error) {
        send({ t: "error", message: error instanceof Error ? error.message : "Generation failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
