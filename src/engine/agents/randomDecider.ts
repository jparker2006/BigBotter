import type { Rng } from "../rng";
import type { AgentDecider, DecisionContext } from "./decider";
import type { VetoUseDecision } from "../rules/veto";

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
    return this.rng.pick(context.finalistIds);
  }

  async pickHouseguestChoice(context: DecisionContext): Promise<string> {
    return this.rng.pick(context.legalIds);
  }
}

