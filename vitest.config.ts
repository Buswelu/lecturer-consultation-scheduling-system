import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
// "server-only" throws outside React Server Components; in the test runner
// (trusted server-side code) resolve its documented no-op stub instead.
// Production resolution is untouched.
const serverOnlyStub = path.join(
  path.dirname(require.resolve("server-only")),
  "empty.js",
);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": serverOnlyStub,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // DB-backed suites hash passwords (Argon2id) and hit PostgreSQL; under
    // parallel load a single fixture can exceed the 5s default. Capped
    // workers keep CPU contention (and login-test timing) stable.
    testTimeout: 30000,
    hookTimeout: 30000,
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
    },
  },
});
