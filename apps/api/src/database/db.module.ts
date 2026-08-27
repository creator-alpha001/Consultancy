import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import './pg-types';

export const PG_POOL = 'PG_POOL';

function poolFromEnv(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({ connectionString, max: 10 });
}

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: poolFromEnv }],
  exports: [PG_POOL],
})
export class DbModule {}
