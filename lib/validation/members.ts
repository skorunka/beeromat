// v1.2 forms hardening — shared schema for the member-invite form.

import { z } from 'zod';

import { formMessages } from './messages';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The four club roles an invite may grant. */
export const MEMBER_ROLES = ['member', 'stock_manager', 'treasurer', 'club_admin'] as const;

/** Member invite — an email address and the role to grant. */
export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: formMessages.required })
    .regex(EMAIL_RE, { error: formMessages.email }),
  role: z.enum(MEMBER_ROLES, { error: formMessages.required }),
});
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;
