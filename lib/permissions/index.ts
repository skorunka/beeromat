// Role hierarchy: club_admin ⊇ treasurer ⊇ stock_manager ⊇ member.
// Encoded as an ordered list so `roleSatisfies` is a simple index lookup.

export const ROLES = ['member', 'stock_manager', 'treasurer', 'club_admin'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = {
  member: 0,
  stock_manager: 1,
  treasurer: 2,
  club_admin: 3,
};

/**
 * Returns true if `actual` is at least as privileged as `required`.
 * Example: `roleSatisfies('treasurer', 'stock_manager') === true`.
 */
export function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Returns true if `actual` satisfies at least one of the listed roles.
 */
export function hasAnyRole(actual: Role, ...required: Role[]): boolean {
  return required.some((r) => roleSatisfies(actual, r));
}
