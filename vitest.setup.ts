/**
 * Vitest global setup: make server-side env available to tests.
 *
 * Loads `.env.local` (DATABASE_URL) without overriding real process env, and
 * provides a test-only SESSION_SECRET when none is configured. Production
 * code paths are unchanged — this file runs in the test runner only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envLocal = join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-only-secret-please-override-in-production-000";
}

// Single-use auth tokens are safe to expose inside the test runner.
process.env.LCSS_DEV_TOKENS = "1";
