// Spec 030 — winner heading formatting. Singles names a single
// winner ("Vítěz: {name}"); doubles names both ("Vítězové: {names}").
// Pure: returns the catalog key (relative to the `match` namespace) +
// interpolation values, so callers render through next-intl with no
// hardcoded copy. Replaces the old gendered "Vyhrál/a" verb.

export interface WinnerLabel {
  /** Key under the `match` i18n namespace. */
  key: 'winnerSingular' | 'winnerPlural';
  values: { name: string };
}

/**
 * @param format   'singles' | 'doubles'
 * @param winnerNames  display names of the winning side (1 for singles, 2 for doubles)
 */
export function winnerLabel(
  format: 'singles' | 'doubles',
  winnerNames: string[],
): WinnerLabel {
  if (format === 'singles') {
    return { key: 'winnerSingular', values: { name: winnerNames[0] ?? '' } };
  }
  return { key: 'winnerPlural', values: { name: winnerNames.filter(Boolean).join(' + ') } };
}
