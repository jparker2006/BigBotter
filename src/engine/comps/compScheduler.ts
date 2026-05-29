import type { Rng } from "../rng";
import { CompType } from "./compCatalog";

function avoidImmediateRepeat(types: { item: CompType; weight: number }[], usedTypes: readonly string[]) {
  const last = usedTypes[usedTypes.length - 1];
  return types.map((entry) => ({
    ...entry,
    weight: entry.item === last ? entry.weight * 0.15 : entry.weight,
  }));
}

export function pickHohComp(rng: Rng, usedTypes: readonly string[], week: number, isAfterDoubleEviction = false): CompType {
  const enduranceWeight = week === 1 || isAfterDoubleEviction ? 5 : 2.6;
  return rng.weightedPick(
    avoidImmediateRepeat(
      [
        { item: CompType.Endurance, weight: enduranceWeight },
        { item: CompType.Physical, weight: 2 },
        { item: CompType.Memory, weight: 1.6 },
        { item: CompType.QnA, weight: 1.6 },
        { item: CompType.Knockout, weight: 1.2 },
        { item: CompType.Crapshoot, weight: 1 },
      ],
      usedTypes,
    ),
  );
}

export function pickVetoComp(rng: Rng, usedTypes: readonly string[], activeCount: number): CompType {
  const hasOtev = usedTypes.includes(CompType.OTEV);
  if (!hasOtev && activeCount <= 9) {
    return CompType.OTEV;
  }
  return rng.weightedPick(
    avoidImmediateRepeat(
      [
        { item: CompType.OTEV, weight: hasOtev ? 1 : 3 },
        { item: CompType.Skill, weight: 2.2 },
        { item: CompType.Crapshoot, weight: 1.8 },
        { item: CompType.Puzzle, weight: 2 },
        { item: CompType.Physical, weight: 1.3 },
        { item: CompType.Memory, weight: 1.2 },
      ],
      usedTypes,
    ),
  );
}

export function finalHohParts(): [CompType, CompType, CompType] {
  return [CompType.Endurance, CompType.Skill, CompType.QnA];
}

