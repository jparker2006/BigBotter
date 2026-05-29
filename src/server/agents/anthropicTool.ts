import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import pLimit from "p-limit";
import type { z } from "zod";
import { requireEnv } from "../env";

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
  private readonly client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

  async callTool<T>(options: ToolCallOptions<T>): Promise<T> {
    return limiter(async () => {
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

      return options.zodSchema.parse(toolInputFromMessage(message, options.toolName));
    });
  }
}
