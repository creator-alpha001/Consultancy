import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import '../src/database/pg-types';

// Minimal .env loader — avoids adding a dependency just for tests. Real
// runtime config loading (if it grows beyond DATABASE_URL/PORT) belongs
// in a proper ConfigModule when identity/ needs one.
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/*
 * `TEST_DATABASE_URL` wins over `DATABASE_URL`, when it is set.
 *
 * A developer's `.env` points at the dev database, because that is what
 * running the app needs. The guard below then refused every local `npm
 * test` — correctly, but with no way forward short of prefixing the
 * command by hand every time, which is how a suite quietly stops being
 * run locally. CI sets `DATABASE_URL` to the test database directly and
 * is unaffected either way.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run tests (see .env.example)');
}

/*
 * These suites TRUNCATE. Refusing anything that is not visibly a test
 * database is the only thing standing between a mistyped variable and
 * someone's development data, so it stays a hard refusal rather than a
 * warning.
 */
if (!process.env.DATABASE_URL.includes('test')) {
  throw new Error(
    `refusing to run tests against a database that doesn't look like a test database: ${process.env.DATABASE_URL}
` +
      'Set TEST_DATABASE_URL (see .env.example) — your DATABASE_URL is for running the app, not for testing.',
  );
}
