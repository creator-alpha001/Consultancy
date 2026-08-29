import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { ErrorEnvelopeFilter } from '../src/common/errors/error-envelope.filter';
import { AuditModule } from '../src/common/audit/audit.module';
import { IdempotencyModule } from '../src/common/idempotency/idempotency.module';
import { DbModule, PG_POOL } from '../src/database/db.module';
import { AuthGuard } from '../src/modules/identity/auth.guard';
import { IdentityModule } from '../src/modules/identity/identity.module';

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
    // IdentityModule and the global AuthGuard are always present, so a
    // test exercises the same default-deny posture as production. A test
    // app where every route is open would prove nothing about the routes
    // that matter.
    imports: [DbModule, IdempotencyModule, AuditModule, IdentityModule, ...extraModules],
    providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
  });
  for (const override of overrides) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();

  // rawBody, as in main.ts — the settlement webhook cannot verify a
  // signature without the bytes as sent.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  const pool = app.get<Pool>(PG_POOL);
  await app.close();
  await pool.end();
}
