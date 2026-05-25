import { describe, expect, it } from 'vitest';

import { canRecordMatchResult } from '@/lib/permissions';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CHARLIE = '33333333-3333-4333-8333-333333333333'; // non-participant

describe('canRecordMatchResult — spec 013 FR-007', () => {
  it('participant member is allowed', () => {
    expect(canRecordMatchResult(ALICE, 'member', [ALICE, BOB])).toBe(true);
  });

  it('non-participant plain member is rejected', () => {
    expect(canRecordMatchResult(CHARLIE, 'member', [ALICE, BOB])).toBe(false);
  });

  it('non-participant stock_manager is rejected (treasurer-and-above override only)', () => {
    expect(canRecordMatchResult(CHARLIE, 'stock_manager', [ALICE, BOB])).toBe(false);
  });

  it('non-participant treasurer is allowed (override path)', () => {
    expect(canRecordMatchResult(CHARLIE, 'treasurer', [ALICE, BOB])).toBe(true);
  });

  it('non-participant club_admin is allowed (treasurer-and-above)', () => {
    expect(canRecordMatchResult(CHARLIE, 'club_admin', [ALICE, BOB])).toBe(true);
  });

  it('participant treasurer is allowed (both paths satisfied)', () => {
    expect(canRecordMatchResult(ALICE, 'treasurer', [ALICE, BOB])).toBe(true);
  });

  it('empty participants list rejects plain members', () => {
    expect(canRecordMatchResult(ALICE, 'member', [])).toBe(false);
  });

  it('empty participants list still allows treasurer override', () => {
    expect(canRecordMatchResult(ALICE, 'treasurer', [])).toBe(true);
  });
});
