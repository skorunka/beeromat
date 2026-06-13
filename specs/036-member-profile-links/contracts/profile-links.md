# Contract: profile-link wiring (spec 036)

Internal UI change — no API. The "contract" is how each row wraps a name in a link.

## BeerIouRow (`components/match/beer-iou-row.tsx`)

```tsx
// The left block (avatar + label text) becomes one Link to the counterparty.
// Buttons (deliver / write-off / cancel) stay SIBLINGS — never inside the Link.
<Link
  href={`/members/${debt.counterpartyMemberId}` as Route}
  className="flex min-w-0 flex-1 items-center gap-3 ..."  // hover underline on the name
>
  <MemberAvatar ... />
  <div className="min-w-0 flex-1"> {label} {plannedBeer?} {stale?} </div>
</Link>
{/* deliver / write-off / cancel buttons remain here, outside the Link */}
```

**Guarantees** (component-tested):
- The avatar+name region is an anchor with `href` ending `/members/{counterpartyMemberId}`.
- The deliver / write-off controls still fire (the link does not capture their taps).
- No `<a>` nested in another `<a>`.

## TabEntryRow (`components/tab/tab-entry-row.tsx`)

```tsx
// On-behalf subtitle only (entry.loggerMemberId present). Runda badge stays OUTSIDE.
{entry.fromRound ? <RundaBadge/> : null}
{entry.loggerMemberId ? (
  <Link href={`/members/${entry.loggerMemberId}` as Route} className="inline-flex items-center gap-1.5 hover:underline ...">
    <MemberAvatar size="inline" ... />
    {entry.loggerDisplayName ? t('byOther', { logger: entry.loggerDisplayName }) : null}
  </Link>
) : (
  /* unchanged text-only fallback when no loggerMemberId */
)}
```

**Guarantees** (component-tested):
- An on-behalf entry renders the "od {logger}" line as an anchor → `/members/{loggerMemberId}`.
- A self-logged entry (no `loggerMemberId`/`loggerDisplayName`) renders NO member link.
- The existing `<Link href="/match/[sourceMatchId]">` on bet rows is untouched (those
  rows are deferred and keep only their match link — no second/nested anchor added).
