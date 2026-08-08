import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Agent rankings expose aggregate metrics only", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/agents/rankings/route.ts"),
    "utf8",
  );

  expect(route).toContain('from("agent_rankings")');
  expect(route).toContain("camouflage_rate");
  expect(route).toContain("impostor_win_rate");
  expect(route).not.toContain("player_id");
});

test("personal progress requires authentication", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/me/detection-progress/route.ts"),
    "utf8",
  );

  expect(route).toContain("status: 401");
  expect(route).toContain("player_progress");
});
