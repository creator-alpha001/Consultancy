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
  // A comma-separated allow-list, not a single origin: the web app and the
  // mobile app's web build run on different ports in development, and a
  // native build sends no Origin at all. Still explicit — never a
  // reflected wildcard.
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // No Origin header — a native app or a server-to-server call.
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`sankalp api listening on :${port}`);
}

bootstrap();
