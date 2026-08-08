import { describe, expect, test } from "bun:test";

import {
  HACKATHON_TAG,
  HACKATHON_WINDOW,
  validateSubmission,
} from "./submission";

describe("hackathon submission validation", () => {
  test("accepts a complete public submission inside the official window", () => {
    const result = validateSubmission({
      pitch:
        "impostoi: descubre a la IA y al impostor en una partida realtime de pistas, charla y votos privados.",
      deployedUrl: "https://impostoi.example",
      demoUrl: "https://video.example/impostoi",
      repositoryUrl: "https://github.com/Atypical-Playworks/impostoi",
      tag: HACKATHON_TAG,
      commitDates: [HACKATHON_WINDOW.startsAt, HACKATHON_WINDOW.endsAt],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test("rejects missing links, the wrong tag, and an out-of-window commit", () => {
    const result = validateSubmission({
      pitch: "pitch",
      deployedUrl: "pending",
      demoUrl: "pending",
      repositoryUrl: "https://github.com/Atypical-Playworks/impostoi",
      tag: "wrong-tag",
      commitDates: ["2026-08-10T00:00:00Z"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      "deployed-url-invalid",
      "demo-url-invalid",
      "required-tag-missing",
      "commit-outside-window",
    ]);
  });

  test("enforces the 280 character pitch limit", () => {
    const result = validateSubmission({
      pitch: "x".repeat(281),
      deployedUrl: "https://impostoi.example",
      demoUrl: "https://video.example/impostoi",
      repositoryUrl: "https://github.com/Atypical-Playworks/impostoi",
      tag: HACKATHON_TAG,
      commitDates: [],
    });

    expect(result.errors).toContain("pitch-too-long");
  });
});
