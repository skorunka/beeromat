import { localeRedirect } from '@/lib/auth/session';

// The casual "settle a bet / take a drink" flow moved into the /match
// hub (2026-05-28). This route is kept only to redirect any old
// bookmarks / deep links to the new single surface.
export default async function BetPageRedirect(): Promise<never> {
  return localeRedirect('/match');
}
