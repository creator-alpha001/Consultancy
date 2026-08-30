import { AutomatedCheckResult } from '../types';

/**
 * One field a provider must fill in to submit this kind of credential.
 *
 * Declared by the VERIFIER, not by core and not by the family: only the
 * verifier knows what it needs to check. A result-list verifier needs a
 * roll number and a year; a document verifier needs a document. Core
 * renders whatever the list says and has no opinion about it, which is
 * what lets a new verifier ship without a UI change.
 *
 * `key` becomes a `verifier_data` key. Whether any of it is ever shown
 * on a profile is a separate decision entirely — the credential type's
 * `publicFields` allow-list, which defaults to empty (CLAUDE.md #30).
 */
export interface VerifierInputField {
  key: string;
  kind: 'text' | 'number' | 'document';
  required: boolean;
}

/**
 * One implementation per `credential_types.verifier` value. The result
 * is always advisory (SPEC-PLATFORM.md §11: submit -> automated checks
 * -> human review -> tier assignment) — a verifier never grants a tier
 * itself, and CredentialService never skips human review because a
 * check passed.
 */
export interface CredentialVerifier {
  readonly code: string;
  /** What a submitter must provide. Rendered generically by any client. */
  readonly inputs: VerifierInputField[];
  check(input: { domainCode: string; verifierData: Record<string, unknown> }): Promise<AutomatedCheckResult>;
}
