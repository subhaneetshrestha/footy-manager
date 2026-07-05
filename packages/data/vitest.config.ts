import { defineConfig } from 'vitest/config';

// The generator sweep and seed.db integration suites do real work (full world
// builds); under `pnpm -r test` all packages run concurrently, so give these
// generous timeouts instead of vitest's 5s default.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
