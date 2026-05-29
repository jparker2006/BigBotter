import type { AgentDecider, DecisionContext } from "../../engine/agents/decider";
import { withValidation } from "../../engine/agents/validateDecision";
import type { VetoUseDecision } from "../../engine/rules/veto";
import { actorPersona, decisionStateSummary, legalIdList } from "./gameSummary";
import { AnthropicToolCaller } from "./anthropicTool";
import {
  idChoiceInputSchema,
  idChoiceSchema,
  juryVoteInputSchema,
  juryVoteSchema,
  nominationInputSchema,
  nominationSchema,
  vetoUseInputSchema,
  vetoUseSchema,
} from "./haikuSchemas";

const SYSTEM_PROMPT = `You are playing a fictional Big Brother US-style strategy game as one houseguest.
Make strategic, self-interested decisions using only the provided game state and actor persona.
Return decisions only through the required tool. Use only legal ids from the prompt.
Do not invent secret knowledge, alliances, conversations, or events that are not provided.`;

function basePrompt(context: DecisionContext): string {
  return [
    `Actor persona:\n${actorPersona(context.state, context.actorId)}`,
    `Game state:\n${decisionStateSummary(context.state)}`,
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

  async juryVote(context: DecisionContext & { finalistIds: string[] }): Promise<string> {
    const result = await this.caller.callTool({
      toolName: "jury_vote",
      description: "Choose one finalist id to vote for as winner.",
      inputSchema: juryVoteInputSchema,
      zodSchema: juryVoteSchema,
      system: SYSTEM_PROMPT,
      prompt: `${basePrompt(context)}\n\nFinalists: ${context.finalistIds.join(
        ", ",
      )}.\nTask: As a juror, vote for the finalist who deserves to win based on gameplay respect and how you were treated.`,
    });
    return result.finalistId;
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
}

