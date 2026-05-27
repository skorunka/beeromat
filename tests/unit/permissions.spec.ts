import { describe, expect, it } from 'vitest';

import { hasAnyRole, ROLES, roleSatisfies } from '@/lib/permissions';

// Pure-function unit tests for the core role-hierarchy primitives.
// canRecordMatchResult has its own spec (match-agreement-authz.spec.ts);
// this file covers the two predicates it composes from.

describe('roleSatisfies — role hierarchy', () => {
  it('every role satisfies itself', () => {
    for (const r of ROLES) {
      expect(roleSatisfies(r, r)).toBe(true);
    }
  });

  it('club_admin satisfies every lower role', () => {
    expect(roleSatisfies('club_admin', 'treasurer')).toBe(true);
    expect(roleSatisfies('club_admin', 'stock_manager')).toBe(true);
    expect(roleSatisfies('club_admin', 'member')).toBe(true);
  });

  it('treasurer satisfies stock_manager and member, but NOT club_admin', () => {
    expect(roleSatisfies('treasurer', 'stock_manager')).toBe(true);
    expect(roleSatisfies('treasurer', 'member')).toBe(true);
    expect(roleSatisfies('treasurer', 'club_admin')).toBe(false);
  });

  it('stock_manager satisfies member, but NOT treasurer / club_admin', () => {
    expect(roleSatisfies('stock_manager', 'member')).toBe(true);
    expect(roleSatisfies('stock_manager', 'treasurer')).toBe(false);
    expect(roleSatisfies('stock_manager', 'club_admin')).toBe(false);
  });

  it('member satisfies only member', () => {
    expect(roleSatisfies('member', 'member')).toBe(true);
    expect(roleSatisfies('member', 'stock_manager')).toBe(false);
    expect(roleSatisfies('member', 'treasurer')).toBe(false);
    expect(roleSatisfies('member', 'club_admin')).toBe(false);
  });
});

describe('hasAnyRole — OR over required roles', () => {
  it('returns true if actual satisfies at least one required role', () => {
    // A stock_manager doesn't satisfy treasurer, but DOES satisfy member.
    expect(hasAnyRole('stock_manager', 'treasurer', 'member')).toBe(true);
  });

  it('returns false if actual satisfies none of the required roles', () => {
    expect(hasAnyRole('member', 'treasurer', 'club_admin')).toBe(false);
    expect(hasAnyRole('stock_manager', 'treasurer', 'club_admin')).toBe(false);
  });

  it('returns false when called with no required roles', () => {
    // Vacuous OR: no required role to match → false.
    expect(hasAnyRole('club_admin')).toBe(false);
  });

  it('club_admin passes ANY non-empty required set', () => {
    expect(hasAnyRole('club_admin', 'member')).toBe(true);
    expect(hasAnyRole('club_admin', 'stock_manager')).toBe(true);
    expect(hasAnyRole('club_admin', 'treasurer')).toBe(true);
    expect(hasAnyRole('club_admin', 'club_admin')).toBe(true);
  });

  it('single-role call delegates to roleSatisfies', () => {
    // hasAnyRole(x, y) === roleSatisfies(x, y) when there's exactly
    // one required role. Sanity check the equivalence.
    for (const a of ROLES) {
      for (const r of ROLES) {
        expect(hasAnyRole(a, r)).toBe(roleSatisfies(a, r));
      }
    }
  });
});
