import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

export const CAUTIOUS_IMITATOR = "cautious-imitator" as const;

export type AgentRole = "civilian" | "impostor";

export type AgentModel = {
  id: string;
  provider: string;
  version: string;
};

export type PublicClue = {
  alias: string;
  text: string;
};

export type AgentAction = "clue" | "discussion" | "vote" | "summary";

export type AgentRequest = {
  action: AgentAction;
  model: AgentModel;
  strategy: typeof CAUTIOUS_IMITATOR;
  role: AgentRole;
  category: string;
  secretWord?: string;
  clues: readonly PublicClue[];
  discussion: string;
};

type AgentOutput = { text: string } | { alias: string } | { summary: string };

export type AgentResult = {
  action: AgentAction;
  output: AgentOutput;
  metadata: {
    fallback: boolean;
    responseTimeMs: number;
  };
};

export type AgentReplayEvent = {
  readonly event_type: "agent_action";
  readonly payload: {
    readonly action: AgentAction;
    readonly fallback: boolean;
  };
  readonly duration_ms: number;
};

type StructuredObjectArgs = {
  model: Parameters<typeof generateObject>[0]["model"];
  schema: z.ZodType;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
};

export type GenerateStructuredObject = (
  args: StructuredObjectArgs,
) => Promise<{ object: unknown }>;

export type AgentAdapterConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
};

const clueSchema = z.object({ text: z.string().min(1) });
const discussionSchema = z.object({ text: z.string().min(1) });
const voteSchema = z.object({ alias: z.string().min(1) });
const summarySchema = z.object({ summary: z.string().min(1) });

function schemaFor(action: AgentAction): z.ZodType {
  switch (action) {
    case "clue":
      return clueSchema;
    case "discussion":
      return discussionSchema;
    case "vote":
      return voteSchema;
    case "summary":
      return summarySchema;
  }
}

function parseOutput(action: AgentAction, object: unknown): AgentOutput {
  switch (action) {
    case "clue":
      return clueSchema.parse(object);
    case "discussion":
      return discussionSchema.parse(object);
    case "vote":
      return voteSchema.parse(object);
    case "summary":
      return summarySchema.parse(object);
  }
}

function fallbackFor(request: AgentRequest): AgentOutput {
  switch (request.action) {
    case "clue":
      return { text: "Mantendré mi pista relacionada con la categoría." };
    case "discussion":
      return { text: "Mi pista sigue siendo coherente con la categoría." };
    case "vote":
      return {
        alias:
          [...request.clues].sort((a, b) => a.alias.localeCompare(b.alias))[0]
            ?.alias ?? "",
      };
    case "summary":
      return { summary: "La respuesta del Agent se resolvió con un fallback." };
  }
}

function promptFor(request: AgentRequest): string {
  const privateContext = {
    role: request.role,
    ...(request.role === "civilian" && request.secretWord
      ? { secretWord: request.secretWord }
      : {}),
  };

  return JSON.stringify({
    action: request.action,
    privateContext,
    category: request.category,
    clues: request.clues,
    discussion: request.discussion,
  });
}

export function agentReplayEvent(result: AgentResult): AgentReplayEvent {
  return {
    event_type: "agent_action",
    payload: { action: result.action, fallback: result.metadata.fallback },
    duration_ms: result.metadata.responseTimeMs,
  };
}

export function createAgentAdapter(
  config: AgentAdapterConfig,
  generate: GenerateStructuredObject = async (args) => {
    const result = await generateObject({
      model: args.model,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      abortSignal: args.abortSignal,
    });
    return { object: result.object };
  },
) {
  const provider = createOpenAICompatible({
    name: "opencode-zen",
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const timeoutMs = config.timeoutMs ?? 10_000;

  return {
    async act(request: AgentRequest): Promise<AgentResult> {
      const startedAt = Date.now();
      const model = provider(request.model.id);
      const controller = new AbortController();
      const operation = Promise.resolve()
        .then(() =>
          generate({
            model,
            schema: schemaFor(request.action),
            system: `Act as a ${request.strategy} Agent in impostoi. Respond only with the requested structured output. Your role is ${request.role}.`,
            prompt: promptFor(request),
            abortSignal: controller.signal,
          }),
        )
        .then(({ object }) => parseOutput(request.action, object));
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        const output = await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("agent-timeout"));
            }, timeoutMs);
          }),
        ]);
        return {
          action: request.action,
          output,
          metadata: { fallback: false, responseTimeMs: Date.now() - startedAt },
        };
      } catch {
        return {
          action: request.action,
          output: fallbackFor(request),
          metadata: { fallback: true, responseTimeMs: Date.now() - startedAt },
        };
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
  };
}
