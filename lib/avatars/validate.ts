import { AVATAR_KEYS, type AvatarKey } from './palette';

// Pure predicate: is this string a valid avatar key the picker knows
// about? Used by the setAvatarAction server action to reject foreign
// inputs, and by <MemberAvatar /> for defensive forward-compat
// (renders the initials fallback if a stored key was removed in a
// later version).

export function isValidAvatarKey(s: string): s is AvatarKey {
  return (AVATAR_KEYS as readonly string[]).includes(s);
}
