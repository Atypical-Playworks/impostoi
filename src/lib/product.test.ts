import { describe, expect, test } from "bun:test";

describe("impostoi bootstrap", () => {
  test("uses the agreed product name", () => {
    expect("impostoi").toBe("impostoi");
  });
});
