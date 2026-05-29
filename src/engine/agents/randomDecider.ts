import type { Rng } from "../rng";
import type { AgentDecider, DecisionContext } from "./decider";
import type { VetoUseDecision } from "../rules/veto";
import { getHouseguest } from "../selectors";

export class RandomDecider implements AgentDecider {
  constructor(private readonly rng: Rng) {}

  async pickNominations(context: DecisionContext): Promise<string[]> {
    return this.rng.shuffle(context.legalIds).slice(0, 2);
  }

  async useVeto(context: DecisionContext & { nomineeIds: string[]; vetoHolderId: string }): Promise<VetoUseDecision> {
    const canSaveSelf = context.nomineeIds.includes(context.vetoHolderId);
    const use = canSaveSelf ? true : this.rng.next() < 0.35;
    if (!use) {
      return { use: false, savedNomineeId: null };
    }
    return { use: true, savedNomineeId: this.rng.pick(context.nomineeIds) };
  }

  async pickReplacementNom(context: DecisionContext & { savedNomineeId: string }): Promise<string> {
    return this.rng.pick(context.legalIds);
  }

  async castEvictionVote(context: DecisionContext & { nomineeIds: string[] }): Promise<string> {
    return this.rng.pick(context.legalIds.length > 0 ? context.legalIds : context.nomineeIds);
  }

  async finalHohEviction(context: DecisionContext & { finalistOptions: string[] }): Promise<string> {
    return this.rng.pick(context.finalistOptions);
  }

  async juryVote(context: DecisionContext & { finalistIds: string[] }): Promise<string> {
    const juror = getHouseguest(context.state, context.actorId);
    const scored = context.finalistIds.map((id) => {
      const trust = juror.notebook.relationships[id]?.trust ?? 0;
      const grudge = juror.notebook.grudges
        .filter((candidate) => candidate.againstId === id)
        .reduce((sum, candidate) => sum + candidate.magnitude, 0);
      return { id, score: trust - grudge + this.rng.nextFloat(-15, 15) };
    });
    return scored.sort((a, b) => b.score - a.score)[0]?.id ?? this.rng.pick(context.finalistIds);
  }

  async pickHouseguestChoice(context: DecisionContext): Promise<string> {
    return this.rng.pick(context.legalIds);
  }
}
