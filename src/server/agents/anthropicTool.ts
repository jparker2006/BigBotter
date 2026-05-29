import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import pLimit from "p-limit";
import type { z } from "zod";
import { requireEnv } from "../env";
import type { AgentCallLog } from "../runs/runLogger";

export const HAIKU_MODEL = "claude-haiku-4-5";

const limiter = pLimit(6);

export type ToolCallOptions<T> = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxTokens?: number;
};

function toolInputFromMessage(message: Awaited<ReturnType<Anthropic["messages"]["create"]>>, toolName: string): unknown {
  if (!("content" in message)) {
    throw new Error("Anthropic response was not a non-streaming message.");
  }
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude did not use required tool: ${toolName}`);
  }
  return toolUse.input;
}

export class AnthropicToolCaller {
  // 30s per-request timeout (vs the SDK's 10-min default) so a hung call fails fast and falls
  // back instead of stalling a long run; maxRetries covers transient network/5xx/429/timeouts.
  private readonly client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY"), timeout: 30_000, maxRetries: 2 });

  // `onCall` (optional) receives a structured log entry for every Haiku tool call — used by
  // the run logger for the M8 debug log. Omitted in scripts/tests, so behaviour is unchanged.
  constructor(private readonly onCall?: (entry: AgentCallLog) => void) {}

  async callTool<T>(options: ToolCallOptions<T>): Promise<T> {
    return limiter(async () => {
      const startedAt = Date.now();
      try {
        const message = await this.client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: options.maxTokens ?? 512,
          temperature: 0.7,
          stream: false,
          system: options.system,
          tools: [
            {
              name: options.toolName,
              description: options.description,
              input_schema: options.inputSchema as Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: options.toolName },
          messages: [{ role: "user", content: options.prompt }],
        });

        const decision = options.zodSchema.parse(toolInputFromMessage(message, options.toolName));
        this.onCall?.({
          ts: startedAt,
          durationMs: Date.now() - startedAt,
          tool: options.toolName,
          prompt: options.prompt,
          system: options.system,
          decision,
          usage: { inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens },
          ok: true,
        });
        return decision;
      } catch (error) {
        this.onCall?.({
          ts: startedAt,
          durationMs: Date.now() - startedAt,
          tool: options.toolName,
          prompt: options.prompt,
          system: options.system,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }
}
