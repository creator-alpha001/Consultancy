import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { ErrorEnvelopeFilter } from '../src/common/errors/error-envelope.filter';
import { IdempotencyModule } from '../src/common/idempotency/idempotency.module';
import { DbModule, PG_POOL } from '../src/database/db.module';

/** Replaces one provider token with a test double — e.g. a payment aggregator that declines. */
export interface ProviderOverride {
  token: unknown;
  useValue: unknown;
}

export async function createTestApp(
  extraModules: Array<Type | DynamicModule> = [],
  overrides: ProviderOverride[] = [],
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [DbModule, IdempotencyModule, ...extraModules],
  });
  for (const override of overrides) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  const pool = app.get<Pool>(PG_POOL);
  await app.close();
  await pool.end();
}
