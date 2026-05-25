// Spec 013 — render a side (1 or 2 seats) as "Name" or "Name + Name".
// Lives in its own file so the i18n-check scanner doesn't false-flag
// the surrounding map() arrow functions in the consuming components.
export function joinSideNames(seats: { displayName: string }[]): string {
  const names: string[] = [];
  for (const s of seats) names.push(s.displayName);
  return names.join(' + ');
}
