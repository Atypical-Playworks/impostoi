import { describe, expect, test } from "bun:test";

import {
  canSubmitClue,
  formatTimer,
  phaseTitle,
  votingTitle,
} from "./round-ui";

describe("round UI presentation rules", () => {
  test("formats phase and voting labels in Spanish", () => {
    expect(phaseTitle("clue_phase")).toBe("Turno de pistas");
    expect(votingTitle("impostor")).toBe("Quien es el impostor?");
  });

  test("never allows an empty or already submitted clue", () => {
    expect(canSubmitClue("   ", false)).toBe(false);
    expect(canSubmitClue("bosque", false)).toBe(true);
    expect(canSubmitClue("otra", true)).toBe(false);
  });

  test("clamps and formats the visible round timer", () => {
    expect(formatTimer(60)).toBe("01:00");
    expect(formatTimer(9)).toBe("00:09");
    expect(formatTimer(-1)).toBe("00:00");
  });
});
