# UI Contract — MatchBetModule on `/`

Post-spec-018 home layout for an authenticated member.

## Inputs

From `app/[locale]/(app)/page.tsx` (added to the existing
`Promise.all` from spec 017):

- `betSummary`: `{ betCount: number, sourceMatchIds: string[] }`
  from the new `matchBetSummaryForMember(memberId, clubId)`
  query helper.

## Render variants

### V1 — No bet-linked consumption in the past 24h

`betSummary.betCount === 0`.

→ `<MatchBetModule />` returns `null`. The home renders exactly
as spec 017 left it: balance sentence → one-tap log → settle.

### V2 — One match obligation

`betSummary.betCount > 0` AND `betSummary.sourceMatchIds.length === 1`.

```
┌─────────────────────────────────────────┐
│ 🍺 Útrata z dnešního zápasu: 2× pivo    │
│ [Vrátit zápas]                          │
└─────────────────────────────────────────┘
```

- Single line of explanatory copy (catalog: `home.matchBet.one`).
- "Vrátit zápas" link → `/match/{sourceMatchIds[0]}` where the
  existing `reverseResult` UI lives. Spec 018 does NOT add a
  void button directly on home — keeps the destructive action in
  its existing place behind the existing audit-trail UI.

### V3 — Multiple match obligations in the past 24h

`betSummary.betCount > 0` AND `sourceMatchIds.length > 1`.

```
┌─────────────────────────────────────────┐
│ 🍺 Útrata z dnešních zápasů: 3× pivo    │
│ [Zobrazit zápasy]                       │
└─────────────────────────────────────────┘
```

- Same shape, plural copy (catalog: `home.matchBet.many`).
- "Zobrazit zápasy" link → `/match` (the existing list view).

### Tone / wording

- No "dlužíš" / "dlužná" / "dlužit" / "you owe". Working copy:
  - cs: `home.matchBet.one = "Útrata z dnešního zápasu: {count}× pivo"`
  - cs: `home.matchBet.many = "Útrata z dnešních zápasů: {count}× pivo"`
  - cs: `home.matchBet.reverseOne = "Vrátit zápas"`
  - cs: `home.matchBet.reverseMany = "Zobrazit zápasy"`
  - en: `home.matchBet.one = "From today's match: {count}× beer"`
  - en: `home.matchBet.many = "From today's matches: {count}× beer"`
  - en: `home.matchBet.reverseOne = "Reverse match"`
  - en: `home.matchBet.reverseMany = "View matches"`

### Visual position

Above the spec-017 one-tap-log button, below the balance
sentence:

```
[greeting]
[balance sentence]
[MatchBetModule]                    ← NEW (V2 or V3 only)
[HomeOneTapLog]                     ← spec 017
[settle CTA if owing]               ← spec 017
```

## /tab distinction for bet-linked rows

Out of strict scope for the home module but required by FR-004:
the `/tab` (My tab) view MUST distinguish bet-linked consumption
rows from regular drinks. Working treatment: a small `"ze
zápasu →"` subtitle below the row's primary line, link to the
match. Catalog: `tab.fromMatch = "ze zápasu →"` /
`"from the match →"`.

## Acceptance gates

A passing implementation MUST:

1. Render exactly the V1/V2/V3 structures above (component
   tests).
2. Pass `pnpm i18n:check` — every new key in both catalogs.
3. Pass `pnpm forms:check` — no native validation introduced.
4. Contain zero literal `dlužíš` / `dlužná` / `dlužit` in
   `messages/{cs,en}.json` or `app/[locale]/(app)/`. Grep-verifiable.
