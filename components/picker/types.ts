// Spec 024 — shared option shape for the two new member pickers
// (MemberPickerGrid + MemberPickerDropdown). Both pickers consume
// rows produced by `listActiveClubMembers` (match-agreements.ts)
// and `listOtherActiveMembers` (members.ts) — neither query
// returns more than these fields.

export interface MemberOption {
  id: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}
