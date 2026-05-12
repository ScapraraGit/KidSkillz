import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/services/**", "src/lib/**"],
      exclude: ["**/*.test.ts", "**/__tests__/**"],
    },
  },
});
