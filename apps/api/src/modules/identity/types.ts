export type UserRole = 'seeker' | 'provider' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface RegisterInput {
  email: string;
  password: string;
  role: UserRole;
  /** CLAUDE.md #27 — the platform is 18+. Registration is refused without this. */
  confirmsAdult: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  adultConfirmedAt: Date | null;
  lastLoginAt: Date | null;
}

export interface LoginInput {
  email: string;
  password: string;
  /** Required for provider and admin accounts; optional for seekers who have enrolled. */
  totpCode?: string;
  /** Alternative to totpCode when a device is lost. Single use. */
  recoveryCode?: string;
  userAgent?: string;
  ipPrefix?: string;
}

/**
 * Either an established session, or a demand for a second factor. A
 * caller must handle both — which is the point: the type makes it
 * impossible to treat a half-finished login as an authenticated one.
 */
export type LoginResult =
  | { outcome: 'session'; token: string; session: SessionRow }
  | { outcome: 'mfa_required'; userId: string };

export interface SessionRow {
  id: string;
  userId: string;
  mfaSatisfied: boolean;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Who the request is actually from. Never assembled from client input. */
export interface Actor {
  userId: string;
  role: UserRole;
  sessionId: string;
  mfaSatisfied: boolean;
}

export interface EnrolFactorResult {
  secret: string;
  provisioningUri: string;
}

export interface RecoveryCodesResult {
  /** Shown exactly once. Only hashes are stored. */
  codes: string[];
}
