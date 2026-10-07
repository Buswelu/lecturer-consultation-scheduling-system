/**
 * LCSS — password hashing (server-only).
 *
 * Argon2id via the `argon2` package. The database stores ONLY the hash;
 * plaintext passwords never leave the request handler and are never logged.
 */
import "server-only";
import argon2 from "argon2";

/** Hash a password for storage in `users.password_hash`. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB — OWASP baseline for interactive logins
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verify a candidate password against a stored hash.
 * Returns `false` (never throws) for wrong passwords and malformed hashes.
 */
export async function verifyPassword(
  passwordHash: string,
  candidate: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, candidate);
  } catch {
    return false;
  }
}
