import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

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

type TextGenerationArgs = {
  model: Parameters<typeof generateText>[0]["model"];
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
};

export type GenerateText = (
  args: TextGenerationArgs,
) => Promise<{ text: string }>;

export type AgentAdapterConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
};

function parseTextOutput(action: AgentAction, text: string): AgentOutput {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty-agent-response");
  switch (action) {
    case "clue":
      return {
        text: trimmed
          .split(/\s+/)[0]
          .replace(/^[^\p{L}\p{N}-]+|[^\p{L}\p{N}-]+$/gu, ""),
      };
    case "discussion":
      return { text: trimmed };
    case "vote":
      return { alias: trimmed };
    case "summary":
      return { summary: trimmed };
  }
}

function fallbackFor(request: AgentRequest): AgentOutput {
  switch (request.action) {
    case "clue":
      return { text: "naturaleza" };
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
  generate: GenerateText = async (args) => {
    const result = await generateText({
      model: args.model,
      system: args.system,
      prompt: args.prompt,
      abortSignal: args.abortSignal,
    });
    return { text: result.text };
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
            system: `Act as a ${request.strategy} Agent in impostoi. Respond with plain text only. Your role is ${request.role}.
GAME RULES:
- When asked for a clue, you MUST provide exactly ONE word. Never a phrase.
- Do not repeat a word that has already been said by another player.
- If you are a civilian (you know the secret word): provide a related word that is not too obvious.
- If you are the impostor (you do not know the secret word): analyze the previous clues to guess the context, and provide a general word that seems to fit in.
- Do not add JSON, punctuation, explanation, or formatting around your answer.`,
            prompt: promptFor(request),
            abortSignal: controller.signal,
          }),
        )
        .then(({ text }) => parseTextOutput(request.action, text));
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
