import { AutomatedCheckResult } from '../types';

/**
 * One implementation per `credential_types.verifier` value. The result
 * is always advisory (SPEC-PLATFORM.md §11: submit -> automated checks
 * -> human review -> tier assignment) — a verifier never grants a tier
 * itself, and CredentialService never skips human review because a
 * check passed.
 */
export interface CredentialVerifier {
  readonly code: string;
  check(input: { domainCode: string; verifierData: Record<string, unknown> }): Promise<AutomatedCheckResult>;
}
