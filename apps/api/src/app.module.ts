import { Module } from '@nestjs/common';
import { DbModule } from './database/db.module';
import { MoneyModule } from './modules/money/money.module';

@Module({
  imports: [DbModule, MoneyModule],
})
export class AppModule {}
