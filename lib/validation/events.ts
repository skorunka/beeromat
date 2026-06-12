import { z } from 'zod';

// Spec 032 — event attendance validation. Shared by client (react-hook-form
// resolver) and server actions.

export const rsvpStatusSchema = z.enum(['going', 'not_going']);

// 1=Mon … 7=Sun (ISO).
const weekdaySchema = z
  .number()
  .int()
  .min(1, { error: 'events.errors.weekdayRequired' })
  .max(7, { error: 'events.errors.weekdayRequired' });

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'events.errors.timeInvalid' });

export const createSeriesSchema = z.object({
  weekday: weekdaySchema,
  startLocalTime: timeSchema,
  placeLabel: z.string().trim().min(1, { error: 'events.errors.placeRequired' }).max(80),
  title: z.string().trim().min(1).max(80).optional(),
});
export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;

export const updateSeriesSchema = z.object({
  seriesId: z.string().uuid(),
  weekday: weekdaySchema.optional(),
  startLocalTime: timeSchema.optional(),
  placeLabel: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(80).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;

export const setRsvpSchema = z.object({
  occurrenceId: z.string().uuid(),
  status: rsvpStatusSchema,
});
export type SetRsvpInput = z.infer<typeof setRsvpSchema>;

// Admin-only on-behalf variant — adds the target member.
export const setMemberRsvpSchema = setRsvpSchema.extend({
  memberId: z.string().uuid(),
});
export type SetMemberRsvpInput = z.infer<typeof setMemberRsvpSchema>;

export const cancelOccurrenceSchema = z.object({ occurrenceId: z.string().uuid() });

// Reset (delete) a member's RSVP back to "no answer". Admin-only variant adds
// the target member.
export const clearRsvpSchema = z.object({ occurrenceId: z.string().uuid() });
export const clearMemberRsvpSchema = clearRsvpSchema.extend({
  memberId: z.string().uuid(),
});
