/**
 * "asha.rathore@example.com" → "A. Rathore".
 *
 * Deliberately lossy. The full address is a contact route, and the
 * spirit of #29/#30 is that we publish conclusions rather than
 * identifiers — a person needs to tell two mentors apart, not to email
 * one directly and take the relationship off-platform.
 *
 * Shared rather than duplicated: a second copy of this that drifted
 * would mean the same person is named one way in search and another on
 * their engagement, which reads as two different people.
 */
export function displayNameFor(email: string): string {
  const local = email.split('@')[0].replace(/\+.*$/, '');
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return 'Member';
  const surname = parts[parts.length - 1];
  const capped = surname.charAt(0).toUpperCase() + surname.slice(1);
  return parts.length > 1 ? `${parts[0].charAt(0).toUpperCase()}. ${capped}` : capped;
}
