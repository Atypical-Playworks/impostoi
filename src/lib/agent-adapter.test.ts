import { describe, expect, test } from "bun:test";

import {
  type AgentRequest,
  createAgentAdapter,
  type GenerateStructuredObject,
} from "@/lib/agent-adapter-config";

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
    const generate: GenerateStructuredObject = async ({ prompt }) => {
      providerPrompt = prompt;
      return { object: { text: "Tiene hábitos nocturnos" } };
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
      output: { text: "Tiene hábitos nocturnos" },
      metadata: { fallback: false, responseTimeMs: expect.any(Number) },
    });
    expect(providerPrompt).toContain('"role":"civilian"');
    expect(providerPrompt).toContain('"secretWord":"zorro"');
  });

  test("uses a deterministic fallback when the provider times out", async () => {
    const neverCompletes: GenerateStructuredObject = () =>
      new Promise(() => {});
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
    expect(result.output).toEqual({
      text: "Mantendré mi pista relacionada con la categoría.",
    });
  });

  test("does not disclose the secret word to an Impostor", async () => {
    let providerPrompt = "";
    const generate: GenerateStructuredObject = async ({ prompt }) => {
      providerPrompt = prompt;
      return { object: { text: "Una pista pública" } };
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
    const invalidOutput: GenerateStructuredObject = async () => ({
      object: { text: "" },
    });

    const result = await createAgentAdapter(
      { apiKey: "secret-key", baseUrl: "https://opencode.example/v1" },
      invalidOutput,
    ).act(request);

    expect(result.metadata.fallback).toBe(true);
    expect(result.output).toEqual({
      text: "Mantendré mi pista relacionada con la categoría.",
    });
  });
});
