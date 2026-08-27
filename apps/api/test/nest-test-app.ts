import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { DbModule, PG_POOL } from '../src/database/db.module';
import { MoneyModule } from '../src/modules/money/money.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [DbModule, MoneyModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  const pool = app.get<Pool>(PG_POOL);
  await app.close();
  await pool.end();
}
