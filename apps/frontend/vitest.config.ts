import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests for the logic that sits below the browser.
 *
 * The journeys and the hardening suite drive a real stack and answer
 * "does the product work". They are slow, need Postgres and a build,
 * and they cannot cheaply enumerate cases — you would not use them to
 * check what happens when a provider has no reviews.
 *
 * These cover the pure functions the adapters and the pack loader are
 * made of: the shapes, the money, the label rules. No DOM, no network,
 * no server, so `src/test/**` deliberately excludes `test/`, which is
 * where the browser suites live and where a `describe` would never run.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
