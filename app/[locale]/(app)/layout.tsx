import { requireMember } from '@/lib/auth/session';

// Authenticated route group layout. Every request to a route inside
// app/[locale]/(app)/* is gated by Better Auth's session. The PIN-gate
// UI (US1 / T056) renders inside the children tree where appropriate;
// any Server Action under (app) additionally calls requireUnlocked()
// for second-factor enforcement on sensitive mutations.
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return <>{children}</>;
}
