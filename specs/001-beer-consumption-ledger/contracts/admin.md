# Contract: Admin (Invitations, Roles, Club Settings)

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions and queries for inviting and managing members, assigning roles, and configuring club-level settings (currency, locale, banking profile, thresholds). All admin operations are scoped to a single club for v1.

---

## Invitations

### `SA` `inviteMember({ email, role, expiresInDays? }) → { invitationId, sentAt }`

Create an invitation and send the magic-link email.

**Input**:
```ts
z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(['member', 'stock_manager', 'treasurer', 'club_admin']),
  expiresInDays: z.number().int().min(1).max(60).optional(),   // default 14
});
```

**Output**: `{ invitationId: string, sentAt: Date }`.

**Behaviour** (transaction + email side-effect):
1. `requireRole('treasurer', 'club_admin')` (FR-013; treasurers may also invite — useful when an admin is unavailable).
2. Check `members` for an active member with this email in this club. If exists → `ALREADY_MEMBER`.
3. Check `invitations` for an open invite to this email in this club. If exists → `ALREADY_INVITED`.
4. Generate a 32-byte random token (`crypto.randomBytes(32).toString('base64url')`).
5. Insert `invitations` row with `token_hash = argon2id(token)` (so the raw token is never stored).
6. Dispatch the magic-link email via Resend using a `react-email` template; the URL is `${BETTER_AUTH_URL}/invitation/${token}?inv=${invitationId}` (token in path, invitation id in query so we can disambiguate if a token collision somehow occurs).
7. Return.

**Errors**: `ALREADY_MEMBER`, `ALREADY_INVITED`, `EMAIL_SEND_FAILED` (best-effort retry; the invitation row stays even if the email fails so admins can resend).

**Role**: treasurer or club_admin. FR-013.

**Related FR**: FR-001, FR-002 (the invitation flow IS the magic-link flow for first-time users).

---

### `SA` `resendInvitation({ invitationId }) → { sentAt }`

Re-dispatch the email for an existing pending invitation. Same URL/token (idempotent for the recipient).

**Input**: `z.object({ invitationId: z.string().uuid() })`.

**Output**: `{ sentAt: Date }`.

**Behaviour**: validate role + invitation status = `pending`; reuse the existing `token_hash` (we kept the raw token… no, we didn't — we only have the hash). Therefore resend issues a **new** token under the hood: rotate `token_hash` to a fresh value, dispatch email with the new token. Old token becomes invalid.

**Role**: treasurer or club_admin.

---

### `SA` `revokeInvitation({ invitationId }) → { ok }`

**Input**: `z.object({ invitationId: z.string().uuid() })`.

**Output**: `{ ok: true }`.

**Behaviour**: `UPDATE invitations SET status = 'revoked' WHERE id = $1 AND status = 'pending'`.

**Role**: treasurer or club_admin.

---

### `Q` `getPendingInvitations() → InvitationRow[]`

```ts
type InvitationRow = {
  id: string,
  email: string,
  role: Role,
  status: 'pending' | 'accepted' | 'expired' | 'revoked',
  createdAt: Date,
  expiresAt: Date,
  createdByDisplayName: string,
};
```

Default filter: `status = 'pending' OR (status = 'accepted' AND accepted_at > now() - interval '30 days')`. Sort: `createdAt DESC`.

**Role**: treasurer or club_admin.

---

## Members and roles

### `SA` `updateMemberRole({ memberId, newRole }) → { ok }`

Change a member's role. Cannot demote the **last** club_admin (safety check).

**Input**:
```ts
z.object({
  memberId: z.string().uuid(),
  newRole: z.enum(['member', 'stock_manager', 'treasurer', 'club_admin']),
});
```

**Output**: `{ ok: true }`.

**Behaviour** (transaction):
1. `requireRole('club_admin')`. Only admins can change roles; treasurers cannot.
2. Load target member, scope to club.
3. If demoting from `club_admin`: count remaining active admins. If `count == 1` and the target IS that admin → `LAST_ADMIN` error.
4. `UPDATE members SET role = $newRole`.

**Errors**: `NOT_FOUND`, `LAST_ADMIN`, `FORBIDDEN`.

**Role**: club_admin. FR-013.

---

### `SA` `deactivateMember({ memberId }) → { ok }` / `reactivateMember({ memberId }) → { ok }`

Soft toggle `is_active`. Deactivation preserves history but prevents future activity (FR-029 edge case).

**Input**: `z.object({ memberId: z.string().uuid() })`.

**Output**: `{ ok: true }`.

**Behaviour**: Same `LAST_ADMIN` safety as `updateMemberRole`.

**Role**: club_admin.

---

### `Q` `getClubMembers({ includeInactive? }) → MemberRow[]`

```ts
type MemberRow = {
  id: string,
  email: string,
  displayName: string,
  role: Role,
  isActive: boolean,
  acceptedInvitationAt: Date | null,
  createdAt: Date,
};
```

Sort: `isActive DESC, displayName ASC`.

**Role**: any member (basic list); treasurer/admin to see inactive + email.

---

## Club settings

### `SA` `updateClubSettings({ patch }) → { ok }`

Edit club-level configuration. All fields optional in patch.

**Input**:
```ts
z.object({
  patch: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
    defaultLocale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
    defaultLowStockThreshold: z.number().int().nonnegative().optional(),
    consumptionUndoWindowSeconds: z.number().int().min(0).max(3600).optional(),
    deviceInactivityLockSeconds: z.number().int().min(60).max(2592000).optional(),  // 1 min – 30 days
  }),
});
```

**Output**: `{ ok: true }`.

**Behaviour**: `UPDATE clubs SET … WHERE id = $clubId`. Currency code change is allowed but has no automatic historical-balance conversion (see spec Assumption: "Currencies do not mix within a club").

**Important**: this Server Action is the ONLY way to change these settings. There is NO environment-variable or build-time override for any of these (Constitution v1.1.1 / FR-043).

**Errors**: `FORBIDDEN`.

**Role**: club_admin. FR-013, FR-043.

---

### `SA` `updateBankingProfile({ patch }) → { ok }`

Edit club banking config. The IBAN being non-null/null toggles member self-pay availability (FR-038).

**Input**:
```ts
z.object({
  patch: z.object({
    iban: z.string().trim().min(15).max(34).regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/).nullable().optional(),
    accountHolderName: z.string().max(120).nullable().optional(),
    revolutHandle: z.string().max(120).nullable().optional(),
    defaultQrMessage: z.string().max(60).nullable().optional(),
  }),
});
```

**Output**: `{ ok: true }`.

**Behaviour**:
- UPSERT into `club_banking_profiles` for the club.
- IBAN is validated server-side via mod-97 check (ISO 13616) in addition to the regex. Invalid → `INVALID_IBAN`.

**Errors**: `INVALID_IBAN`, `FORBIDDEN`.

**Role**: club_admin. FR-038, FR-043.

---

### `Q` `getClubSettings() → ClubSettings`

```ts
type ClubSettings = {
  id: string,
  name: string,
  currencyCode: string,
  defaultLocale: string,
  defaultLowStockThreshold: number,
  consumptionUndoWindowSeconds: number,
  deviceInactivityLockSeconds: number,
  banking: {
    iban: string | null,
    accountHolderName: string | null,
    revolutHandle: string | null,
    defaultQrMessage: string | null,
    nextVariableSymbol: bigint,            // for admin visibility / debugging
  },
};
```

**Role**: club_admin (full); other roles see a redacted version (no IBAN, no `nextVariableSymbol`).

---

## Notes on role hierarchy

Across all contracts, the implicit hierarchy is:

```
club_admin  ⊇  treasurer  ⊇  stock_manager  ⊇  member
```

A `requireRole(...)` call with multiple roles is an OR. A `club_admin` automatically satisfies every role check. `requireRole('treasurer')` allows both `treasurer` and `club_admin`. The `permissions` module exports a `roleSatisfies(actual, required)` helper that encodes this.
