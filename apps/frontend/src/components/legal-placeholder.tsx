import type { ReactNode } from 'react';
import { Card, Eyebrow } from './ui';

/**
 * The honest-placeholder banner every /legal/* and /help page opens with.
 *
 * CLAUDE.md is explicit that regulatory and tax figures across this
 * project are placeholders pending a fintech lawyer and a chartered
 * accountant. A binding Terms of Service or Privacy Policy is exactly
 * that kind of content — inventing one here would read as real to a
 * user and is worse than admitting it does not exist yet. This banner
 * says so, plainly, on every page in this section, and the page below
 * it sticks to describing what the product actually does today rather
 * than what a lawyer would eventually promise.
 */
export function LegalPlaceholder({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-6">
      <Card className="border-caution-line bg-caution-soft p-5">
        <Eyebrow>Not yet reviewed by counsel</Eyebrow>
        <p className="mt-2 max-w-reading text-body">
          This page does not carry a binding policy yet. Sankalp has not been through legal review, so nothing here
          is a promise you can rely on — it is a plain description of how the product behaves today, which is not
          the same thing.
        </p>
      </Card>
      {children}
    </div>
  );
}
