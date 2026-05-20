import 'server-only';

import { memberBalance, paymentsTotal } from '@/lib/balance/calculate';

export interface MemberBalanceView {
  /** Outstanding balance: confirmed consumption − confirmed payments. */
  balanceMinor: bigint;
  /** Sum of the member's claimed-but-not-yet-confirmed payments. */
  pendingConfirmationMinor: bigint;
  currencyCode: string;
}

/**
 * Balance summary for the member dashboard + settle screen
 * (contracts/payments.md → getMyBalance). `balanceMinor` is what the
 * member still owes; `pendingConfirmationMinor` is what they have
 * claimed to have paid but a treasurer hasn't confirmed yet.
 */
export async function getMyBalance(
  memberId: string,
  currencyCode: string,
): Promise<MemberBalanceView> {
  const [balanceMinor, pendingConfirmationMinor] = await Promise.all([
    memberBalance(memberId),
    paymentsTotal(memberId, 'claimed'),
  ]);
  return { balanceMinor, pendingConfirmationMinor, currencyCode };
}
