import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const IdentityErrorCode = {
  /** Deliberately one code for "no such account" AND "wrong password" — see below. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  ADULT_CONFIRMATION_REQUIRED: 'ADULT_CONFIRMATION_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  MFA_NOT_ENROLLED: 'MFA_NOT_ENROLLED',
  MFA_ALREADY_ENROLLED: 'MFA_ALREADY_ENROLLED',
  SESSION_INVALID: 'SESSION_INVALID',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
} as const;

export type IdentityErrorCode = (typeof IdentityErrorCode)[keyof typeof IdentityErrorCode];

/**
 * ONE error for a bad email and a bad password, with one status and one
 * message. Distinguishing them turns the login endpoint into an account
 * enumeration oracle — an attacker learns which addresses are registered,
 * which on this platform means learning who is preparing for a civil
 * services exam. That is not a detail worth leaking for a nicer error
 * message.
 */
export function invalidCredentials(): AppError {
  return new AppError(IdentityErrorCode.INVALID_CREDENTIALS, 'email or password is incorrect', {
    status: HttpStatus.UNAUTHORIZED,
  });
}

export function emailAlreadyRegistered(): AppError {
  // Registration genuinely cannot avoid revealing that an address is
  // taken. The mitigation belongs in the flow (verify by email before
  // confirming the account exists), not in a vaguer error here.
  return new AppError(IdentityErrorCode.EMAIL_ALREADY_REGISTERED, 'that email is already registered', {
    status: HttpStatus.CONFLICT,
  });
}

export function adultConfirmationRequired(): AppError {
  return new AppError(
    IdentityErrorCode.ADULT_CONFIRMATION_REQUIRED,
    'this platform is for adults aged 18 and over',
    { status: HttpStatus.UNPROCESSABLE_ENTITY },
  );
}

export function passwordTooWeak(reason: string): AppError {
  return new AppError(IdentityErrorCode.PASSWORD_TOO_WEAK, reason, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: { reason },
  });
}

export function accountLocked(until: Date): AppError {
  return new AppError(
    IdentityErrorCode.ACCOUNT_LOCKED,
    'too many failed attempts; this account is temporarily locked',
    { status: HttpStatus.TOO_MANY_REQUESTS, detail: { until: until.toISOString() } },
  );
}

export function accountNotActive(status: string): AppError {
  return new AppError(IdentityErrorCode.ACCOUNT_NOT_ACTIVE, `this account is ${status}`, {
    status: HttpStatus.FORBIDDEN,
    detail: { status },
  });
}

export function mfaRequired(): AppError {
  return new AppError(IdentityErrorCode.MFA_REQUIRED, 'a second factor is required to sign in', {
    status: HttpStatus.UNAUTHORIZED,
  });
}

export function mfaInvalid(): AppError {
  return new AppError(IdentityErrorCode.MFA_INVALID, 'that code is not valid', {
    status: HttpStatus.UNAUTHORIZED,
  });
}

export function mfaNotEnrolled(role: string): AppError {
  return new AppError(
    IdentityErrorCode.MFA_NOT_ENROLLED,
    `${role} accounts must enrol a second factor before signing in`,
    { status: HttpStatus.FORBIDDEN, detail: { role } },
  );
}

export function mfaAlreadyEnrolled(): AppError {
  return new AppError(IdentityErrorCode.MFA_ALREADY_ENROLLED, 'a second factor is already enrolled', {
    status: HttpStatus.CONFLICT,
  });
}

export function sessionInvalid(): AppError {
  return new AppError(IdentityErrorCode.SESSION_INVALID, 'not signed in', {
    status: HttpStatus.UNAUTHORIZED,
  });
}

export function forbiddenRole(required: string[], actual: string): AppError {
  return new AppError(
    IdentityErrorCode.FORBIDDEN_ROLE,
    `this action requires one of: ${required.join(', ')}`,
    { status: HttpStatus.FORBIDDEN, detail: { required, actual } },
  );
}
