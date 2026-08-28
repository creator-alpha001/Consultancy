import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Money is `bigint` paise everywhere in this codebase (CLAUDE.md: never
 * float, never rupees, never JS `number` arithmetic on currency) — and
 * `JSON.stringify` throws outright on a bigint. Until now each
 * controller serialized its own, which works right up until the one that
 * forgets and 500s on a money path.
 *
 * So: convert at the boundary, once, for every response. bigint becomes
 * a decimal STRING rather than a number, deliberately — a paise amount
 * large enough to matter would silently lose precision as a JS number,
 * and a string that a client must parse on purpose is safer than a
 * number it can quietly get wrong.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => serializeBigInts(body)));
  }
}

export function serializeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(serializeBigInts);

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = serializeBigInts(v);
  }
  return out;
}
