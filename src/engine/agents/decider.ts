import type { GameState, Phase, RoomId } from "../types";
import type { VetoUseDecision } from "../rules/veto";
import type { CompType } from "../comps/compCatalog";

export type DecisionContext = {
  state: GameState;
  actorId: string;
  legalIds: string[];
  reason: string;
};

export type SocialIntent =
  | "build_trust"
  | "campaign"
  | "protect_ally"
  | "target_threat"
  | "form_alliance"
  | "make_deal"
  | "test_showmance"
  | "spread_lie"
  | "jury_management";

export type ConversationPlan = {
  participantIds: string[];
  preferredRoomId?: RoomId | null;
  intent: SocialIntent;
};

export type RelationshipDelta = {
  targetId: string;
  trustDelta: number;
  sentiment?: string;
  note?: string;
  grudgeMagnitude?: number;
};

export type AllianceProposal = {
  name: string;
  memberIds: string[];
  secret?: boolean;
};

export type DealProposal = {
  partyIds: string[];
  terms: string;
};

export type SocialTurn = {
  text: string;
  done: boolean;
  relationshipDeltas?: RelationshipDelta[];
  memories?: { witnessIds?: string[]; what: string; magnitude: number }[];
  allianceProposal?: AllianceProposal | null;
  dealProposal?: DealProposal | null;
  showmanceTargetId?: string | null;
  secretsShared?: string[];
  readsShared?: string[];
};

export type SocialPlanContext = DecisionContext & {
  phase: Phase;
  roomId: RoomId;
};

export type SocialTurnContext = DecisionContext & {
  phase: Phase;
  roomId: RoomId;
  participantIds: string[];
  witnessIds: string[];
  intent: SocialIntent;
  turnIndex: number;
  priorTurns: { speakerId: string; text: string }[];
};

export type HostNarrationContext = {
  state: GameState;
  beat: string;
  text: string;
  focusIds?: string[];
};

export type CompQuestion = {
  id: string;
  prompt: string;
  correctAnswer: string;
  sourceEvent?: string;
};

export type CompAnswer = {
  answer: string;
  confidence: number;
};

export type CompQuestionContext = {
  state: GameState;
  compType: CompType;
  phase: Phase | "final_hoh_part_1" | "final_hoh_part_2" | "final_hoh_part_3";
  playerIds: string[];
  roundCount: number;
};

export type CompAnswerContext = DecisionContext & {
  compType: CompType;
  question: CompQuestion;
  round: number;
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
  planConversation?(context: SocialPlanContext): Promise<ConversationPlan>;
  speakTurn?(context: SocialTurnContext): Promise<SocialTurn | string>;
  acceptDeal?(context: DecisionContext): Promise<boolean>;
  confessional?(context: DecisionContext): Promise<string>;
  hostNarration?(context: HostNarrationContext): Promise<string>;
  generateCompQuestions?(context: CompQuestionContext): Promise<CompQuestion[]>;
  answerCompQuestion?(context: CompAnswerContext): Promise<CompAnswer>;
}
