// v1.2 forms hardening — shared schema for the invitation-accept form.

import { z } from 'zod';

import { formMessages } from './messages';

/** Invitation accept — the new member picks the name the club knows them by. */
export const acceptInvitationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'invitation.errorNameRequired' })
    .max(80, { error: formMessages.tooLong }),
});
export type AcceptInvitationValues = z.infer<typeof acceptInvitationSchema>;
