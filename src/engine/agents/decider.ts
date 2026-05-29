import type { GameState } from "../types";
import type { VetoUseDecision } from "../rules/veto";

export type DecisionContext = {
  state: GameState;
  actorId: string;
  legalIds: string[];
  reason: string;
};

export interface AgentDecider {
  pickNominations(context: DecisionContext): Promise<string[]>;
  useVeto(context: DecisionContext & { nomineeIds: string[]; vetoHolderId: string }): Promise<VetoUseDecision>;
  pickReplacementNom(context: DecisionContext & { savedNomineeId: string }): Promise<string>;
  castEvictionVote(context: DecisionContext & { nomineeIds: string[]; isTiebreaker?: boolean }): Promise<string>;
  finalHohEviction(context: DecisionContext & { finalistOptions: string[] }): Promise<string>;
  juryVote(context: DecisionContext & { finalistIds: string[] }): Promise<string>;
  pickHouseguestChoice(context: DecisionContext): Promise<string>;
  decideMovement?(context: DecisionContext): Promise<string | null>;
  initiateConversation?(context: DecisionContext): Promise<string[]>;
  speakTurn?(context: DecisionContext): Promise<string>;
  acceptDeal?(context: DecisionContext): Promise<boolean>;
  confessional?(context: DecisionContext): Promise<string>;
}

