import type {
  AgentDecider,
  CompAnswer,
  CompAnswerContext,
  CompQuestion,
  CompQuestionContext,
  ConversationPlan,
  DecisionContext,
  HostNarrationContext,
  JuryVote,
  SocialPlanContext,
  SocialTurn,
  SocialTurnContext,
} from "../../engine/agents/decider";
import { withValidation } from "../../engine/agents/validateDecision";
import type { VetoUseDecision } from "../../engine/rules/veto";
import { getHouseguest } from "../../engine/selectors";
import { actorPersona, compactNotebook, compactState, decisionStateSummary, legalIdList } from "./gameSummary";
import { AnthropicToolCaller } from "./anthropicTool";
import {
  idChoiceInputSchema,
  idChoiceSchema,
  juryVoteInputSchema,
  juryVoteSchema,
  conversationPlanInputSchema,
  conversationPlanSchema,
  compAnswerInputSchema,
  compAnswerSchema,
  compQuestionInputSchema,
  compQuestionSchema,
  nominationInputSchema,
  nominationSchema,
  socialTurnInputSchema,
  socialTurnSchema,
  textLineInputSchema,
  textLineSchema,
  vetoUseInputSchema,
  vetoUseSchema,
} from "./haikuSchemas";

const SYSTEM_PROMPT = `You are playing a fictional Big Brother US-style strategy game as one houseguest.
Make strategic, self-interested decisions using only the provided game state and actor persona.
Return decisions only through the required tool. Use only legal ids from the prompt.
Do not invent secret knowledge, alliances, conversations, or events that are not provided.`;

const HOST_SYSTEM_PROMPT = `You are the host narrator for a fictional Big Brother-style game called Big Botter.
You are a stylized homage to the crisp, dramatic reality-competition host role, not a real person.
Do not impersonate or quote a real host. Keep narration punchy, polished, and episode-ready.`;

function basePrompt(context: DecisionContext): string {
  return [
    `Actor persona:\n${actorPersona(context.state, context.actorId)}`,
    `Game state:\n${decisionStateSummary(context.state, context.actorId)}`,
    `Legal ids:\n${legalIdList(context.state, context.legalIds)}`,
  ].join("\n\n");
}

export class HaikuDecider implements AgentDecider {
  constructor(private readonly caller = new AnthropicToolCaller()) {}

  async pickNominations(context: DecisionContext): Promise<string[]> {
    const result = await this.caller.callTool({
      toolName: "pick_nominations",
      description: "Choose exactly two legal houseguest ids for nomination.",
      inputSchema: nominationInputSchema,
      zodSchema: nominationSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nTask: As HOH, nominate exactly two houseguests. Balance threat level, personal safety, jury management, and plausible Big Brother strategy.`,
    });
    return result.nomineeIds;
  }

  async useVeto(context: DecisionContext & { nomineeIds: string[]; vetoHolderId: string }): Promise<VetoUseDecision> {
    const result = await this.caller.callTool({
      toolName: "use_veto",
      description: "Decide whether to use the Power of Veto and identify the nominee saved if used.",
      inputSchema: vetoUseInputSchema,
      zodSchema: vetoUseSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nCurrent nominees: ${context.nomineeIds.join(", ")}.\nTask: Decide whether to use the Power of Veto. If using it, savedNomineeId must be one current nominee id. If not using it, savedNomineeId must be null.`,
    });
    return { use: result.use, savedNomineeId: result.use ? result.savedNomineeId : null };
  }

  async pickReplacementNom(context: DecisionContext & { savedNomineeId: string }): Promise<string> {
    const result = await this.caller.callTool({
      toolName: "pick_replacement_nominee",
      description: "Choose one legal replacement nominee id.",
      inputSchema: idChoiceInputSchema,
      zodSchema: idChoiceSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nSaved nominee: ${context.savedNomineeId}.\nTask: As HOH, choose one legal replacement nominee.`,
    });
    return result.selectedId;
  }

  async castEvictionVote(context: DecisionContext & { nomineeIds: string[]; isTiebreaker?: boolean }): Promise<string> {
    const result = await this.caller.callTool({
      toolName: "cast_eviction_vote",
      description: "Choose one legal nominee id to evict.",
      inputSchema: idChoiceInputSchema,
      zodSchema: idChoiceSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nNominees: ${context.nomineeIds.join(", ")}.\nTask: ${
        context.isTiebreaker ? "As HOH, break the tie by evicting one nominee." : "Cast your eviction vote."
      }`,
    });
    return result.selectedId;
  }

  async finalHohEviction(context: DecisionContext & { finalistOptions: string[] }): Promise<string> {
    const result = await this.caller.callTool({
      toolName: "final_hoh_eviction",
      description: "Choose one legal Final 3 opponent to evict.",
      inputSchema: idChoiceInputSchema,
      zodSchema: idChoiceSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nFinal 2 options if you evict one: ${context.finalistOptions.join(
        ", ",
      )}.\nTask: As final HOH, evict one person and choose who you sit next to.`,
    });
    return result.selectedId;
  }

  async juryVote(context: DecisionContext & { finalistIds: string[] }): Promise<JuryVote> {
    const result = await this.caller.callTool({
      toolName: "jury_vote",
      description: "Choose one finalist id to vote for as winner.",
      inputSchema: juryVoteInputSchema,
      zodSchema: juryVoteSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nFinalists: ${context.finalistIds.join(
        ", ",
      )}.\nTask: As a juror, vote for the finalist who deserves to win based on gameplay respect and how you were treated. Give a short, candid jury-speech reason for your vote.`,
    });
    return { finalistId: result.finalistId, reasoning: result.reasoning };
  }

  async pickHouseguestChoice(context: DecisionContext): Promise<string> {
    const result = await withValidation(
      () =>
        this.caller.callTool({
          toolName: "pick_houseguest_choice",
          description: "Choose one legal houseguest id to play in veto.",
          inputSchema: idChoiceInputSchema,
          zodSchema: idChoiceSchema,
          system: SYSTEM_PROMPT,
          prompt: `${basePrompt(context)}\n\nTask: You drew Houseguest's Choice for veto. Pick one legal houseguest to play.`,
        }),
      (decision) => (context.legalIds.includes(decision.selectedId) ? decision : null),
      () => ({ selectedId: context.legalIds[0]!, reasoning: "Fallback legal Houseguest's Choice." }),
    );
    return result.selectedId;
  }

  async planConversation(context: SocialPlanContext): Promise<ConversationPlan> {
    const result = await this.caller.callTool({
      toolName: "plan_conversation",
      description: "Choose who to approach for a Big Brother-style scheming conversation.",
      inputSchema: conversationPlanInputSchema,
      zodSchema: conversationPlanSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nYou are currently in ${context.roomId}. Phase: ${context.phase}.
Task: choose 1-3 legal houseguests to approach for a strategic conversation. You may lie, test trust, campaign, make a deal, or form an alliance. Use only your private notebook and public game state.`,
    });
    return {
      participantIds: result.participantIds,
      preferredRoomId: result.preferredRoomId,
      intent: result.intent,
    };
  }

  async speakTurn(context: SocialTurnContext): Promise<SocialTurn> {
    const prior = context.priorTurns.map((turn) => `${turn.speakerId}: ${turn.text}`).join("\n") || "none";
    const result = await this.caller.callTool({
      toolName: "speak_social_turn",
      description: "Speak one scheming conversation turn and identify private notebook updates caused by it.",
      inputSchema: socialTurnInputSchema,
      zodSchema: socialTurnSchema,
      system: `${SYSTEM_PROMPT}
For dialogue, be sharp, funny, strategic, and rated-R when natural. Do not use slurs. You may lie in spoken text.
Notebook updates must only apply to people in the room or listed witnesses. Do not reveal information the actor does not know.`,
      prompt: `${basePrompt(context)}\n\nRoom: ${context.roomId}
Participants: ${context.participantIds.join(", ")}
Possible overhearers/witnesses: ${context.witnessIds.join(", ") || "none"}
Conversation intent: ${context.intent}
Prior turns:
${prior}

Task: Speak exactly one line as the actor. Also return relationship deltas, memories, secrets/reads shared, and any alliance/deal/showmance proposal that this line actually creates. Keep updates limited to what the actor says or what listeners could witness.`,
    });
    return {
      text: result.text,
      done: result.done,
      relationshipDeltas: result.relationshipDeltas,
      memories: result.memories,
      allianceProposal: result.allianceProposal,
      dealProposal: result.dealProposal,
      showmanceTargetId: result.showmanceTargetId,
      secretsShared: result.secretsShared,
      readsShared: result.readsShared,
    };
  }

  async confessional(context: DecisionContext): Promise<string> {
    // Light prompt: persona + compact situation + the juicy notebook bits only (no full roster
    // or relationship table) — confessionals were the #1 token consumer.
    const relevant = context.legalIds.map((id) => getHouseguest(context.state, id).name).join(", ") || "none";
    const result = await this.caller.callTool({
      toolName: "diary_room_confessional",
      description: "Generate one private Diary Room confessional in the actor's voice.",
      inputSchema: textLineInputSchema,
      zodSchema: textLineSchema,
      system: `${SYSTEM_PROMPT}
Diary Room confessionals can be strategic, funny, profane, petty, and candid. Do not use slurs. Keep it fictional and concise.`,
      prompt: `You are ${actorPersona(context.state, context.actorId)}

Situation: ${compactState(context.state)}
${compactNotebook(context.state, context.actorId)}

Confessional reason: ${context.reason}
Relevant houseguests: ${relevant}
Task: Give one private to-camera Diary Room confessional, 1-3 sentences, in the actor's talking style. It may contradict what they say publicly. Refer to people by name, never by id.`,
    });
    return result.text;
  }

  async hostNarration(context: HostNarrationContext): Promise<string> {
    const result = await this.caller.callTool({
      toolName: "host_narration",
      description: "Generate one polished host narration line.",
      inputSchema: textLineInputSchema,
      zodSchema: textLineSchema,
      system: HOST_SYSTEM_PROMPT,
      prompt: `Beat: ${context.beat}
Raw event: ${context.text}
Focus ids: ${context.focusIds?.join(", ") || "none"}
Week: ${context.state.week}
Phase: ${context.state.phase}
Task: Rewrite the raw event as one concise host line. Keep the facts unchanged.`,
    });
    return result.text;
  }

  async generateCompQuestions(context: CompQuestionContext): Promise<CompQuestion[]> {
    const history = context.state.publicHistory.slice(-30).join("\n") || "No completed events yet.";
    const result = await this.caller.callTool({
      toolName: "generate_comp_questions",
      description: "Generate knowledge competition clues from actual season history.",
      inputSchema: compQuestionInputSchema,
      zodSchema: compQuestionSchema,
      system: HOST_SYSTEM_PROMPT,
      prompt: `Competition: ${context.compType}
Phase: ${context.phase}
Needed questions: ${context.roundCount}
Players: ${context.playerIds.join(", ")}
Actual public season history:
${history}

Task: Generate exactly ${context.roundCount} questions based only on actual season-history lines above.
For OTEV, make each prompt a short mean rhyming animatronic clue. correctAnswer should be the specific event or named answer from the source line.
For other knowledge comps, use clear recall questions. Do not invent events.`,
    });
    return result.questions.slice(0, context.roundCount);
  }

  async answerCompQuestion(context: CompAnswerContext): Promise<CompAnswer> {
    const result = await this.caller.callTool({
      toolName: "answer_comp_question",
      description: "Answer one competition question as the actor.",
      inputSchema: compAnswerInputSchema,
      zodSchema: compAnswerSchema,
      system: SYSTEM_PROMPT,
      prompt: `You are ${actorPersona(context.state, context.actorId)}

Situation: ${compactState(context.state)}
Competition: ${context.compType}, round ${context.round}
Question: ${context.question.prompt}
Task: Answer as the actor from memory. If unsure, guess plausibly. Return only the answer and confidence.`,
    });
    return { answer: result.answer, confidence: result.confidence };
  }
}
