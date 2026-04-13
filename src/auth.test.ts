import { describe, expect, test } from "bun:test";
import { verifySecret } from "./auth";

const expected = "correct-horse-battery-staple";

describe("verifySecret", () => {
  test("accepts Authorization: Bearer token", () => {
    expect(verifySecret("Bearer correct-horse-battery-staple", null, expected)).toBe(true);
    expect(verifySecret("bearer correct-horse-battery-staple", null, expected)).toBe(true);
  });

  test("rejects wrong bearer secret", () => {
    expect(verifySecret("Bearer wrong", null, expected)).toBe(false);
  });

  test("rejects missing bearer prefix", () => {
    expect(verifySecret("correct-horse-battery-staple", null, expected)).toBe(false);
    expect(verifySecret("Basic abc", null, expected)).toBe(false);
  });

  test("accepts X-Stevedore-Secret when Authorization is absent or not Bearer", () => {
    expect(verifySecret(null, "correct-horse-battery-staple", expected)).toBe(true);
    expect(verifySecret("Token x", "correct-horse-battery-staple", expected)).toBe(true);
  });

  test("rejects when both headers missing or empty", () => {
    expect(verifySecret(null, null, expected)).toBe(false);
    expect(verifySecret("", "", expected)).toBe(false);
    expect(verifySecret(null, "  ", expected)).toBe(false);
  });

  test("Bearer wins when both present", () => {
    expect(
      verifySecret("Bearer correct-horse-battery-staple", "wrong", expected),
    ).toBe(true);
    expect(verifySecret("Bearer wrong", "correct-horse-battery-staple", expected)).toBe(false);
  });

  test("trims bearer value and header whitespace", () => {
    expect(verifySecret("  Bearer  correct-horse-battery-staple  ", null, expected)).toBe(true);
    expect(verifySecret(null, "  correct-horse-battery-staple  ", expected)).toBe(true);
  });

  test("unicode secrets compare correctly", () => {
    const u = "🔑スティーブドア";
    expect(verifySecret(`Bearer ${u}`, null, u)).toBe(true);
    expect(verifySecret(`Bearer ${u}x`, null, u)).toBe(false);
  });
});
