import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { forbiddenRole, sessionInvalid } from './errors';
import { SessionService } from './session.service';
import { Actor, UserRole } from './types';

/** Marks a route as reachable without a session (login, register). */
export const PUBLIC_ROUTE = 'identity:public';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

/** Restricts a route to specific roles. Absent = any authenticated actor. */
export const REQUIRED_ROLES = 'identity:roles';
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);

export interface AuthedRequest extends Request {
  actor?: Actor;
}

/**
 * Resolves the bearer token to a real actor, or rejects.
 *
 * This is the replacement for the `x-actor-id` header, and the reason
 * CLAUDE.md #28 ("Never trust a client-supplied user ID") now holds:
 * there is no request field a client can set that this guard will
 * believe. The actor comes from a session row keyed by a token digest,
 * and the role is re-read from `users` on every request rather than
 * carried in the token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization');
    if (!header?.toLowerCase().startsWith('bearer ')) throw sessionInvalid();

    const actor = await this.sessions.resolveActor(header.slice(7).trim());
    if (!actor) throw sessionInvalid();

    const required = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(actor.role)) {
      throw forbiddenRole(required, actor.role);
    }

    req.actor = actor;
    return true;
  }
}

/**
 * Injects the authenticated actor into a handler.
 *
 * Handlers take the actor from here and NEVER from a body or query
 * parameter — that is what makes "scope every query by the authenticated
 * actor" (#28) mechanical rather than a thing to remember.
 */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): Actor => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  if (!req.actor) throw sessionInvalid();
  return req.actor;
});
