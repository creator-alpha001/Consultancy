/**
 * Writes the API's route inventory to packages/contract/routes.json.
 *
 * WHY THIS EXISTS, AND WHY IT IS ONLY ROUTES
 *
 * There are now two clients against one API — apps/frontend and
 * apps/app — and the failure that killed the last second client was not
 * type drift. It was whole features landing on one client and not the
 * other: by the time apps/mobile was paused it had none of payment, file
 * upload, annotation, services, packages, earnings, payouts,
 * availability or training. Nothing detected any of it.
 *
 * This file is the first half of the fix. `SwaggerModule` enumerates
 * every route from the running application, so the list cannot drift
 * from the API: it IS the API. `scripts/parity.mjs` then reports which
 * routes each client actually calls.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: types.
 *
 * A spike on 2026-09-09 measured this rather than guessing. Swagger with
 * no CLI plugin produces, from this codebase:
 *
 *     133 paths, 148 operations, 0 response schemas,
 *     0 request schemas, 0 component schemas.
 *
 * Zero, because every response model here is a TypeScript `interface`,
 * which is erased at compile time, and the swagger plugin introspects
 * decorated DTO *classes*. Getting types out of it would mean adopting
 * the Nest CLI or ts-patch and converting the response models of fifteen
 * modules to decorated classes — invasive surgery on a working API with
 * 456 passing tests, for a client-generation benefit.
 *
 * So types are hand-authored on each client for now, and that is
 * recorded as owed in TRACKER.md rather than pretended away. The route
 * inventory is free, is exact, and catches the failure that actually
 * happened.
 *
 * Run: npm run routes   (from apps/api)
 */
import 'reflect-metadata';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

interface RouteEntry {
  method: string;
  path: string;
  /** `ControllerName_handlerName`, so a route can be traced to its code. */
  operationId: string;
}

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Sankalp API').setVersion('0').build(),
  );

  const routes: RouteEntry[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(item as Record<string, unknown>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      routes.push({
        method: method.toUpperCase(),
        path,
        operationId: (op as { operationId?: string }).operationId ?? '',
      });
    }
  }

  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  const out = join(__dirname, '../../../packages/contract/routes.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        $comment: [
          'GENERATED FILE — DO NOT EDIT.',
          '',
          'Source:     the running NestJS application, via SwaggerModule.',
          'Regenerate: cd apps/api && npm run routes',
          '',
          'This is the route inventory both clients are measured against.',
          'It carries no types, on purpose — see apps/api/scripts/dump-routes.ts.',
        ],
        generatedFrom: 'apps/api',
        count: routes.length,
        routes,
      },
      null,
      2,
    )}\n`,
  );

  // eslint-disable-next-line no-console
  console.log(`wrote packages/contract/routes.json — ${routes.length} routes`);
  await app.close();
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
