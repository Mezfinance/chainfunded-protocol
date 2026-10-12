import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["worker/test/**/*.test.{js,cjs}"],
    root: path.resolve(__dirname, ".."),
    testTimeout: 30_000,
    // Run each test file in its own forked process. Several modules read env
    // (signer keys, pool address) at import time; without process isolation a
    // module's state leaks across files and shifts timing in the flaky
    // executors tests.
    pool: "forks",
    isolate: true,
  },
  resolve: {
    alias: {
      "@worker": path.resolve(__dirname, "."),
    },
  },
});
