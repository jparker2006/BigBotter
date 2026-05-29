import { z } from "zod";

export const nominationSchema = z.object({
  nomineeIds: z.array(z.string()).length(2),
  reasoning: z.string().min(1),
});

export const vetoUseSchema = z.object({
  use: z.boolean(),
  savedNomineeId: z.string().nullable(),
  reasoning: z.string().min(1),
});

export const idChoiceSchema = z.object({
  selectedId: z.string(),
  reasoning: z.string().min(1),
});

export const juryVoteSchema = z.object({
  finalistId: z.string(),
  reasoning: z.string().min(1),
});

const socialIntentSchema = z.enum([
  "build_trust",
  "campaign",
  "protect_ally",
  "target_threat",
  "form_alliance",
  "make_deal",
  "test_showmance",
  "spread_lie",
  "jury_management",
]);

export const conversationPlanSchema = z.object({
  participantIds: z.array(z.string()).min(1).max(4),
  preferredRoomId: z
    .enum(["hoh_room", "bedrooms", "kitchen", "living_room", "backyard", "diary_room", "have_not_room", "storage"])
    .nullable(),
  intent: socialIntentSchema,
  reasoning: z.string().min(1),
});

export const socialTurnSchema = z.object({
  text: z.string().min(1),
  // The model frequently omits `done` or sends a non-boolean; never let that drop the whole
  // turn to a canned fallback line — default to false (the conversation just runs to its cap).
  done: z.boolean().catch(false),
  relationshipDeltas: z
    .array(
      z.object({
        targetId: z.string(),
        trustDelta: z.number().int().min(-25).max(25),
        sentiment: z.string().optional(),
        note: z.string().optional(),
        grudgeMagnitude: z.number().int().min(1).max(100).optional(),
      }),
    )
    .optional(),
  memories: z
    .array(
      z.object({
        witnessIds: z.array(z.string()).optional(),
        what: z.string(),
        magnitude: z.number().int().min(1).max(100),
      }),
    )
    .optional(),
  allianceProposal: z
    .object({
      name: z.string(),
      memberIds: z.array(z.string()).min(2).max(6),
      secret: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  dealProposal: z
    .object({
      partyIds: z.array(z.string()).min(2).max(4),
      terms: z.string(),
    })
    .nullable()
    .optional(),
  showmanceTargetId: z.string().nullable().optional(),
  secretsShared: z.array(z.string()).optional(),
  readsShared: z.array(z.string()).optional(),
  reasoning: z.string().min(1),
});

export const textLineSchema = z.object({
  text: z.string().min(1).max(700),
});

export const compQuestionSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        prompt: z.string().min(1).max(280),
        correctAnswer: z.string().min(1).max(180),
        sourceEvent: z.string().max(220).optional(),
      }),
    )
    .min(1)
    .max(8),
});

export const compAnswerSchema = z.object({
  answer: z.string().min(1),
  // Tolerate an out-of-range/odd confidence now that answers actually parse — default to 0.5.
  confidence: z.number().min(0).max(1).catch(0.5),
  reasoning: z.string().min(1),
});

export type NominationToolInput = z.infer<typeof nominationSchema>;
export type VetoUseToolInput = z.infer<typeof vetoUseSchema>;
export type IdChoiceToolInput = z.infer<typeof idChoiceSchema>;
export type JuryVoteToolInput = z.infer<typeof juryVoteSchema>;
export type ConversationPlanToolInput = z.infer<typeof conversationPlanSchema>;
export type SocialTurnToolInput = z.infer<typeof socialTurnSchema>;
export type TextLineToolInput = z.infer<typeof textLineSchema>;
export type CompQuestionToolInput = z.infer<typeof compQuestionSchema>;
export type CompAnswerToolInput = z.infer<typeof compAnswerSchema>;

export const nominationInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nomineeIds: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { type: "string" },
      description: "Exactly two legal houseguest ids to nominate.",
    },
    reasoning: { type: "string" },
  },
  required: ["nomineeIds", "reasoning"],
};

export const vetoUseInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    use: { type: "boolean", description: "Whether to use the Power of Veto." },
    savedNomineeId: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Nominee id saved by veto, or null if not using it.",
    },
    reasoning: { type: "string" },
  },
  required: ["use", "savedNomineeId", "reasoning"],
};

export const idChoiceInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    selectedId: { type: "string", description: "One legal houseguest id." },
    reasoning: { type: "string" },
  },
  required: ["selectedId", "reasoning"],
};

export const juryVoteInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    finalistId: { type: "string", description: "The finalist id receiving this juror's vote to win." },
    reasoning: { type: "string" },
  },
  required: ["finalistId", "reasoning"],
};

export const conversationPlanInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    participantIds: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
      description: "Legal houseguest ids to approach. Do not include yourself; the engine adds you.",
    },
    preferredRoomId: {
      anyOf: [
        {
          type: "string",
          enum: ["hoh_room", "bedrooms", "kitchen", "living_room", "backyard", "diary_room", "have_not_room", "storage"],
        },
        { type: "null" },
      ],
    },
    intent: {
      type: "string",
      enum: [
        "build_trust",
        "campaign",
        "protect_ally",
        "target_threat",
        "form_alliance",
        "make_deal",
        "test_showmance",
        "spread_lie",
        "jury_management",
      ],
    },
    reasoning: { type: "string" },
  },
  required: ["participantIds", "preferredRoomId", "intent", "reasoning"],
};

export const socialTurnInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", description: "One spoken line in the actor's voice, 1-3 sentences." },
    done: { type: "boolean", description: "Whether the conversation can end after this line." },
    relationshipDeltas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          targetId: { type: "string" },
          trustDelta: { type: "integer", minimum: -25, maximum: 25 },
          sentiment: { type: "string" },
          note: { type: "string" },
          grudgeMagnitude: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["targetId", "trustDelta"],
      },
    },
    memories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          witnessIds: { type: "array", items: { type: "string" } },
          what: { type: "string" },
          magnitude: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["what", "magnitude"],
      },
    },
    allianceProposal: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            memberIds: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
            secret: { type: "boolean" },
          },
          required: ["name", "memberIds"],
        },
        { type: "null" },
      ],
    },
    dealProposal: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            partyIds: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
            terms: { type: "string" },
          },
          required: ["partyIds", "terms"],
        },
        { type: "null" },
      ],
    },
    showmanceTargetId: { anyOf: [{ type: "string" }, { type: "null" }] },
    secretsShared: { type: "array", items: { type: "string" } },
    readsShared: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
  required: ["text", "done", "relationshipDeltas", "memories", "allianceProposal", "dealProposal", "showmanceTargetId", "secretsShared", "readsShared", "reasoning"],
};

export const textLineInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
};

export const compQuestionInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          prompt: { type: "string", description: "The clue/question to present to players." },
          correctAnswer: { type: "string", description: "The exact correct answer." },
          sourceEvent: { type: "string", description: "The real season event this clue is based on." },
        },
        required: ["id", "prompt", "correctAnswer"],
      },
    },
  },
  required: ["questions"],
};

export const compAnswerInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" },
  },
  required: ["answer", "confidence", "reasoning"],
};
