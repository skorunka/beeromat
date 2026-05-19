'use client';

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

// Browser-side Better Auth client. Component-import target for the
// sign-in form and the user menu.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { useSession, signIn, signOut } = authClient;
