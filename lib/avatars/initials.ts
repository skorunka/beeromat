// Pulled out of components/nav/user-menu.tsx so the new
// <MemberAvatar /> renderer can reuse it without importing from a
// UI component. Single canonical implementation — two-letter
// initials from a display name, '?' for empty.

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
