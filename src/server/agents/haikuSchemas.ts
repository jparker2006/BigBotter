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

export type NominationToolInput = z.infer<typeof nominationSchema>;
export type VetoUseToolInput = z.infer<typeof vetoUseSchema>;
export type IdChoiceToolInput = z.infer<typeof idChoiceSchema>;
export type JuryVoteToolInput = z.infer<typeof juryVoteSchema>;

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
