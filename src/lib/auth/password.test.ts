import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (Argon2id)", () => {
  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct-horse-123");
    expect(await verifyPassword(hash, "correct-horse-123")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-123");
    expect(await verifyPassword(hash, "wrong-password-456")).toBe(false);
  });

  it("never stores or returns plaintext", async () => {
    const hash = await hashPassword("plaintext-never-stored");
    expect(hash).not.toContain("plaintext-never-stored");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("returns false (never throws) for malformed hashes", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});
