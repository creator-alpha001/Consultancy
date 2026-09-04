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
 * made of: the shapes, the money, the label rules — and, in `.test.tsx`
 * files, the handful of components that render a CONTRACT rather than a
 * layout. Those get a DOM but no network and no server, so they stay
 * fast enough to enumerate cases. `test/` is excluded throughout: that
 * is where the browser suites live, and a `describe` there would never
 * run.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    /*
     * A DOM only where one is asked for. Most of this suite is pure
     * functions, and paying for a document per file to check arithmetic
     * would be a waste — a component test opts in with
     * `@vitest-environment happy-dom` at the top of the file.
     */
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
