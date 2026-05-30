import { localeRedirect } from '@/lib/auth/session';

// The standalone beer-grid /log page was retired (2026-05-30): the
// home one-tap split-button + chevron dropdown cover picking a beer,
// and stock visibility lives at /admin/beer-types. Kept only as a
// redirect for old bookmarks / deep links.
export default async function LogPageRedirect(): Promise<never> {
  return localeRedirect('/');
}
