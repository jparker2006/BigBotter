import type { GameEvent, GameState, SeasonTape } from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class TapeWriter {
  private readonly state0: GameState;
  private readonly events: GameEvent[] = [];

  constructor(state0: GameState) {
    this.state0 = clone(state0);
  }

  append(event: GameEvent): void {
    this.events.push(clone(event));
  }

  appendMany(events: readonly GameEvent[]): void {
    for (const event of events) {
      this.append(event);
    }
  }

  build(): SeasonTape {
    return {
      state0: clone(this.state0),
      events: clone(this.events),
    };
  }
}

