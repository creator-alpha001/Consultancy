import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';

/**
 * "There is nothing here" answered as `204 No Content` rather than as a
 * `200` with an empty body.
 *
 * Several GETs return null as a LEGITIMATE answer rather than an error —
 * `assessment-template` for an objective category that has no rubric at
 * all (CLAUDE.md #3), `evaluations/latest` before anything is written,
 * `disputes` when none was raised. Nest's Express adapter renders a null
 * return as `response.send()`, which is a 200 carrying an empty string.
 *
 * That is ambiguous in a way that bit a real client: an empty 200 is
 * indistinguishable from a void endpoint's reply, it does not parse as
 * JSON, and a client that reasonably types the route as returning an
 * object crashes on it. `apps/app` did exactly that, on precisely the
 * "this category has no template" path the rule exists to make
 * renderable (TRACKER D59).
 *
 * 204 says the same thing unambiguously, is what HTTP is for, and needs
 * no special case: `apps/frontend` already checks `status === 204`, and
 * so does `apps/app`.
 *
 * Scope is deliberately narrow — GET only. A POST that legitimately
 * answers with nothing is already a 201/200 with an empty body and is
 * not ambiguous, because a caller of a mutation is not looking for a
 * resource.
 */
@Injectable()
export class AbsentAsNoContentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const method = http.getRequest<{ method: string }>().method;

    return next.handle().pipe(
      map((body) => {
        if (method === 'GET' && (body === null || body === undefined)) {
          http.getResponse<Response>().status(204);
        }
        return body;
      }),
    );
  }
}
