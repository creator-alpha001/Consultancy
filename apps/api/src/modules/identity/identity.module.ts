import { Module } from '@nestjs/common';

/**
 * Auth, users, roles, sessions. Placeholder — the `users` table exists
 * (money/other modules reference it via FK) but the module's own logic
 * is not part of M1 (money spine).
 */
@Module({})
export class IdentityModule {}
