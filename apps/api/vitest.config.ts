import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    // Integration tests hit a real Postgres. Neon pooler can be sluggish on
    // cold starts so the default 5s timeout is too tight. Single-fork mode
    // also keeps the connection pool small enough to not exhaust it.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/services/**", "src/lib/**"],
      exclude: ["**/*.test.ts", "**/__tests__/**"],
    },
  },
});
