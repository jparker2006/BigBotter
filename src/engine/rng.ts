export interface Rng {
  next(): number;
  nextFloat(min?: number, max?: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  weightedPick<T>(items: readonly { item: T; weight: number }[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextFloat(min = 0, max = 1) {
      return min + next() * (max - min);
    },
    int(min: number, max: number) {
      return Math.floor(this.nextFloat(min, max + 1));
    },
    pick<T>(items: readonly T[]) {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }
      return items[this.int(0, items.length - 1)]!;
    },
    shuffle<T>(items: readonly T[]) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    weightedPick<T>(items: readonly { item: T; weight: number }[]) {
      if (items.length === 0) {
        throw new Error("Cannot weighted-pick from an empty list.");
      }
      const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (total <= 0) {
        return this.pick(items.map((entry) => entry.item));
      }
      let cursor = this.nextFloat(0, total);
      for (const entry of items) {
        cursor -= Math.max(0, entry.weight);
        if (cursor <= 0) {
          return entry.item;
        }
      }
      return items[items.length - 1]!.item;
    },
  };
}

