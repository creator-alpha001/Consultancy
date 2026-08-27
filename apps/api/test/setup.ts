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

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run tests (see .env.example)');
}
if (!process.env.DATABASE_URL.includes('test')) {
  throw new Error(
    `refusing to run tests against a database that doesn't look like a test database: ${process.env.DATABASE_URL}`,
  );
}
