import { logoutAction } from '@/app/actions/auth';

/** Sign out via a plain form POST, so it works without JavaScript. */
export async function POST(): Promise<Response> {
  await logoutAction();
  return new Response(null, { status: 303, headers: { Location: '/' } });
}
