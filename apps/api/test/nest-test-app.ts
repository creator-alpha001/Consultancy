import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { ErrorEnvelopeFilter } from '../src/common/errors/error-envelope.filter';
import { IdempotencyModule } from '../src/common/idempotency/idempotency.module';
import { DbModule, PG_POOL } from '../src/database/db.module';

export async function createTestApp(
  extraModules: Array<Type | DynamicModule> = [],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [DbModule, IdempotencyModule, ...extraModules],
  }).compile();

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
