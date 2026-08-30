export type UserRole = 'seeker' | 'provider' | 'admin';

/**
 * `full` is an ordinary session. `mfa_enrolment` is issued after a
 * correct password to a provider/admin with no confirmed factor yet, and
 * the guard accepts it on the enrolment routes ONLY — it is a bootstrap,
 * not a login.
 */
export type SessionScope = 'full' | 'mfa_enrolment';
export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface RegisterInput {
  email: string;
  password: string;
  role: UserRole;
  /** CLAUDE.md #27 — the platform is 18+. Registration is refused without this. */
  confirmsAdult: boolean;
  /**
   * Which family's agreement wording was shown. Optional so a caller
   * that has no domain context still registers — but when it is absent,
   * nothing is recorded beyond the timestamp, which is the weaker state
   * this exists to move away from.
   */
  familyCode?: string;
  lang?: string;
  ipPrefix?: string;
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
  | {
      /**
       * Password was correct, but this provider/admin has no second
       * factor yet (#32). The ticket authorises enrolment and nothing
       * else — see `SessionScope`.
       */
      outcome: 'mfa_enrolment_required';
      enrolmentToken: string;
      expiresAt: Date;
    };

export interface SessionRow {
  id: string;
  userId: string;
  scope: SessionScope;
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
  scope: SessionScope;
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
