import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorEnvelopeFilter } from './common/errors/error-envelope.filter';

async function bootstrap(): Promise<void> {
  // rawBody: the payment aggregator's webhook signature is computed over
  // the bytes as sent, and a re-serialised body will never verify.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalFilters(new ErrorEnvelopeFilter());

  // The web app runs on its own origin in development and calls this API
  // directly from the server side; `credentials` is on because sessions
  // travel as a bearer token the web layer holds in an httpOnly cookie.
  // The allowed origin is explicit — never a reflected wildcard.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`sankalp api listening on :${port}`);
}

bootstrap();
