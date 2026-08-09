import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

import type { AgentRequest, GenerateText } from "@/lib/agent-adapter-config";

const { agentReplayEvent, createAgentAdapter } = await import(
  "@/lib/agent-adapter-config"
);

const request: AgentRequest = {
  action: "clue",
  model: {
    id: "mimo-v2.5-free",
    provider: "opencode-zen",
    version: "mimo-v2.5-free",
  },
  strategy: "cautious-imitator",
  role: "civilian",
  category: "Animales",
  secretWord: "zorro",
  clues: [{ alias: "Luna", text: "Vive cerca del bosque" }],
  discussion: "El grupo compara las pistas.",
};

describe("OpenCode Zen Agent adapter", () => {
  test("returns structured output and keeps role context in the provider prompt", async () => {
    let providerPrompt = "";
    let systemPrompt = "";
    const generate: GenerateText = async ({ prompt, system }) => {
      providerPrompt = prompt;
      systemPrompt = system;
      return { text: "nocturna" };
    };

    const result = await createAgentAdapter(
      {
        apiKey: "secret-key",
        baseUrl: "https://opencode.example/v1",
      },
      generate,
    ).act(request);

    expect(result).toEqual({
      action: "clue",
      output: { text: "nocturna" },
      metadata: { fallback: false, responseTimeMs: expect.any(Number) },
    });
    expect(providerPrompt).toContain('"role":"civilian"');
    expect(providerPrompt).toContain('"secretWord":"zorro"');
    expect(systemPrompt).toContain("cautious-imitator");
  });

  test("uses the model supplied by the request", async () => {
    let modelId = "";
    const generate: GenerateText = async ({ model }) => {
      modelId = (model as { modelId: string }).modelId;
      return { text: "Una pista" };
    };

    await createAgentAdapter(
      { apiKey: "secret-key", baseUrl: "https://opencode.example/v1" },
      generate,
    ).act({
      ...request,
      model: {
        id: "another-model",
        provider: "opencode-zen",
        version: "another-model-v1",
      },
    });

    expect(modelId).toBe("another-model");
  });

  test("uses a deterministic fallback when the provider times out", async () => {
    let wasAborted = false;
    const neverCompletes: GenerateText = ({ abortSignal }) => {
      abortSignal?.addEventListener("abort", () => {
        wasAborted = true;
      });
      return new Promise(() => {});
    };
    const adapter = createAgentAdapter(
      {
        apiKey: "secret-key",
        baseUrl: "https://opencode.example/v1",
        timeoutMs: 5,
      },
      neverCompletes,
    );

    const result = await adapter.act(request);

    expect(result.metadata.fallback).toBe(true);
    expect(result.metadata.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(wasAborted).toBe(true);
    expect(result.output).toEqual({
      text: "naturaleza",
    });
  });

  test("does not disclose the secret word to an Impostor", async () => {
    let providerPrompt = "";
    const generate: GenerateText = async ({ prompt }) => {
      providerPrompt = prompt;
      return { text: "Una pista pública" };
    };

    await createAgentAdapter(
      { apiKey: "secret-key", baseUrl: "https://opencode.example/v1" },
      generate,
    ).act({
      ...request,
      role: "impostor",
    });

    expect(providerPrompt).toContain('"role":"impostor"');
    expect(providerPrompt).not.toContain("zorro");
  });

  test("uses the fallback when the provider returns an invalid shape", async () => {
    const invalidOutput: GenerateText = async () => ({ text: "" });

    const result = await createAgentAdapter(
      { apiKey: "secret-key", baseUrl: "https://opencode.example/v1" },
      invalidOutput,
    ).act(request);

    expect(result.metadata.fallback).toBe(true);
    expect(result.output).toEqual({
      text: "naturaleza",
    });
    expect(agentReplayEvent(result)).toEqual({
      event_type: "agent_action",
      payload: { action: "clue", fallback: true },
      duration_ms: expect.any(Number),
    });
  });

  test("supports every structured agent action", async () => {
    const outputs = {
      clue: { text: "pista" },
      discussion: { text: "Una respuesta" },
      vote: { alias: "Luna" },
      summary: { summary: "Resumen del encuentro" },
    } as const;

    for (const action of Object.keys(outputs) as AgentRequest["action"][]) {
      const result = await createAgentAdapter(
        { apiKey: "secret-key", baseUrl: "https://opencode.example/v1" },
        async () => ({
          text:
            action === "clue"
              ? outputs.clue.text
              : action === "discussion"
                ? outputs.discussion.text
                : action === "vote"
                  ? outputs.vote.alias
                  : outputs.summary.summary,
        }),
      ).act({ ...request, action });

      expect(result.output).toEqual(outputs[action]);
      expect(result.metadata.fallback).toBe(false);
    }
  });
});
