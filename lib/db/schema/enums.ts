import { pgEnum } from 'drizzle-orm/pg-core';

// Member role hierarchy (encoded in lib/permissions): club_admin ⊇ treasurer
// ⊇ stock_manager ⊇ member.
export const memberRole = pgEnum('member_role', [
  'member',
  'stock_manager',
  'treasurer',
  'club_admin',
]);

export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);

// Payment state machine: see contracts/payments.md.
// claimed → confirmed | disputed
// confirmed → voided
export const paymentStatus = pgEnum('payment_status', [
  'claimed',
  'confirmed',
  'disputed',
  'voided',
]);

export const paymentOrigin = pgEnum('payment_origin', [
  'member_initiated',
  'treasurer_initiated',
]);

export const stockChangeKind = pgEnum('stock_change_kind', [
  'restock',
  'adjustment',
  'consumption_decrement',
  'consumption_void_increment',
]);
