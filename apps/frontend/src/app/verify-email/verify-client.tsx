'use client';

import { useEffect, useRef, useState } from 'react';
import { verifyEmail } from '@/app/actions/account';

type State = 'working' | 'done' | 'invalid' | 'missing' | 'failed';

/**
 * Confirms the address as soon as the page opens. The token comes from the
 * URL fragment, which never reaches a server log — see the reset form for
 * the same reasoning.
 */
export function VerifyEmail(): JSX.Element {
  const [state, setState] = useState<State>('working');
  // A token works once. Development mode runs effects twice, and a second
  // call would report a perfectly good link as spent.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const match = /(?:^|[#&])token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    const token = match?.[1];
    if (!token) {
      setState('missing');
      return;
    }
    void verifyEmail(token).then((r) => {
      window.history.replaceState(null, '', window.location.pathname);
      setState(r.error === null ? 'done' : r.error === 'TOKEN_INVALID' ? 'invalid' : 'failed');
    });
  }, []);

  const text: Record<State, string> = {
    working: 'Confirming…',
    done: 'Your email address is confirmed. Thank you.',
    invalid:
      'This link is not valid any more — it may already have been used, or a newer one was sent. If your address is not confirmed yet, you can send a new link from your account page.',
    missing: 'This page needs the link from your email.',
    failed: 'That did not go through. Try the link again in a moment.',
  };

  return (
    <div role={state === 'done' ? 'status' : state === 'working' ? undefined : 'alert'} className="space-y-4">
      <p className="text-body">{text[state]}</p>
      {state !== 'working' && (
        <a href="/account" className="text-brand underline underline-offset-2">
          Go to your account
        </a>
      )}
    </div>
  );
}
