import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/better-auth';

// Mount Better Auth's HTTP handler at /api/auth/* — magic-link request,
// magic-link verification callback, session creation, sign-out.
export const { GET, POST } = toNextJsHandler(auth);
