# Contract: v1 Badge Catalog + i18n copy (spec 035)

The fixed v1 badge set, their unlock conditions, and the bilingual copy contract.
Tone: playful, warm, never mean-spirited (matches spec 034's funline tone). Final
wording may be polished at implement time; meaning + key structure are fixed here.

## i18n key structure

Under a new `achievement.*` namespace in `messages/{cs,en}.json`:

```text
achievement.sectionTitle        -- "Odznaky" / "Achievements"
achievement.earnedCount         -- ICU: "{earned} z {total}" / "{earned} of {total}"
achievement.empty               -- friendly note when nothing earned yet (gallery still shows all locked)
achievement.earnedOn            -- "Získáno {date}" / "Earned {date}"  (claimed badge date, FR-003)
achievement.progress            -- ICU: "{current} / {target}"  (locked progress bar, FR-004)
achievement.rarity              -- ICU: "{holders} z {total} členů" / "{holders} of {total} members"  (US3/FR-020)
achievement.rarityNone          -- "Zatím nikdo — buď první!" / "Nobody yet — be the first!"  (US3)
achievement.unlocked            -- toast: "Odznak odemčen: {badge}" / "Achievement unlocked: {badge}"
achievement.badge.<key>.name      -- short badge name
achievement.badge.<key>.desc      -- one-line playful description (shown on earned tile)
achievement.badge.<key>.condition -- the unlock condition, shown for EVERY badge (FR-002), e.g. "Log 100 beers"
```

`pnpm i18n:check` enforces cs/en key parity. The new component(s) likely need a
line in `scripts/i18n-check.ts` EXCLUDED set ONLY if the JSX-text regex
false-positives (same arrow/ternary issue spec 034's `leaderboard-board.tsx` hit) —
all real copy flows through `t('achievement.*')`, never literal JSX text.

## The nine badges

> The final column is `achievement.badge.<key>.condition` — shown for **every** badge
> (earned and locked), per FR-002. The locked progress bar pairs it with the
> `current / target` reading from each badge's `progress()` fn.

| key | emoji | Predicate (over `MemberStats`) | name (en) | desc (en, playful) | condition (en, shown for all) |
|-----|-------|-------------------------------|-----------|--------------------|-------------------|
| `centuryClub`  | 💯 | `totalBeers >= 100` | Century Club | 100 beers deep. A true regular. | Log 100 beers |
| `winner`       | 🏆 | `won >= 25` | Winner | 25 wins on the board. | Win 25 matches |
| `sharpshooter` | 📈 | `matchesPlayed >= 10 && winRatio >= 0.6` | Sharpshooter | Wins 6 in 10. Pick your opponents wisely. | Win 60% over 10+ matches |
| `onFire`       | 🔥 | `currentStreak >= 5` | On Fire | Five wins in a row — someone stop them. | Win 5 matches in a row |
| `hatTrick`     | 🎩 | `bestStreak >= 3` | Hat-trick | Strung three wins together. | Win 3 matches in a row |
| `roundKing`    | 🤝 | `roundsPoured >= 10` | Round King | Poured 10 rounds for the crew. Legend. | Pour 10 rounds for others |
| `regular`      | 🎾 | `matchesPlayed >= 25` | Regular | 25 matches in. Always up for one. | Play 25 matches |
| `connoisseur`  | 🍺 | `distinctBeerTypes >= 5` | Connoisseur | Sampled 5 different beers. Refined palate. | Try 5 different beers |
| `nightOwl`     | 🦉 | `sessionsAttended >= 25` | Night Owl | Showed up 25 nights. The clubhouse misses you when you're gone. | Attend 25 sessions |

Czech copy (`cs`) is authored alongside in the same warm register (e.g.
`centuryClub.name` = "Stovkař", `roundKing.name` = "Král rund"); exact wording
settled in implementation, parity enforced by the gate.

## Display order

The `BADGES` array order in `catalog.ts` is the on-profile order. Chosen rough
"prestige/fun" order: centuryClub, winner, sharpshooter, onFire, hatTrick,
roundKing, regular, connoisseur, nightOwl. (Earned ones show first; locked after.)

## Out of scope (v1) — do NOT add to the catalog now

- Tiered escalations (💯→ 250 → 500 beers; multiple win-count tiers).
- Relative / point-in-time badges ("Giant-killer", "was #1 on a board", "beat the
  reigning champ") — these need event capture, not a snapshot predicate.
These are recorded in BACKLOG after the feature ships.
