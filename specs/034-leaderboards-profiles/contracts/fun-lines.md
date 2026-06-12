# Contract: fun-line engine (`lib/stats/fun-lines.ts` + `funline.*` i18n)

## Shape

```ts
interface FunLine {
  key: string;                              // a funline.* catalog key
  params: Record<string, string | number>;  // fills the ICU template
}

// Pure: which playful lines apply to this member, most-fun first.
selectFunLines(stats: MemberStats): FunLine[];
```

The page renders the **top 1–2** via `t(line.key, line.params)`. Empty list ⇒
render nothing (or one gentle default line). NO string building in code — copy +
plurals live in the cs/en catalogs (i18n + forms gates stay green).

## Line set (v1 ≥ 6, warm/teasing, never mean)

| key | Qualifies when | params | cs / en (sketch) |
|---|---|---|---|
| `funline.undefeated` | `currentStreak ≥ 3` | `{count}` | "Neporažen už {count}× — zastavte ho! 🔥" / "Undefeated in {count} — someone stop them. 🔥" |
| `funline.subscription` | a nemesis with `losses ≥ 5, wins = 0` | `{wins,losses,name}` | "{losses}–{wins} s {name}. To není rivalita, to je předplatné." / "{wins}–{losses} vs {name}. It's not a rivalry, it's a subscription." |
| `funline.professional` | `beersPerNight ≥ 3` | `{avg}` | "Průměr {avg} piv na večer — profík. 🍺" / "Averages {avg} beers a night — a true professional. 🍺" |
| `funline.sugarDaddy` | `roundsPoured ≥ 10` | `{count}` | "Naservíroval {count} rund — klubový sponzor. 💸" / "Has poured {count} rounds — the club's sugar daddy. 💸" |
| `funline.payUp` | `owesMostTo.beerCount ≥ 2` | `{count,name}` | "Dluží {name} {count} piv — zaplať! 🍺" / "Owes {name} {count} beers — pay up. 🍺" |
| `funline.believe` | `lastWinAt` older than 30d (and played ≥1) | `{date}` | "Nevyhrál od {date}. Věříme ti. 🎾" / "Hasn't won since {date}. We believe in you. 🎾" |
| `funline.favouriteBeer` | `favouriteBeer.count ≥ 10` | `{beer,count}` | "{beer} ×{count} — věrnost se cení. 🍺" / "{beer} ×{count} — loyalty pays. 🍺" |

(Exact copy finalised during implementation; the table is the contract for keys
+ guards + params.)

## Rules

- `selectFunLines` is **pure + total** — same stats ⇒ same ordered lines; no
  randomness, no Date.now() inside (pass `now` in if a line needs it, e.g.
  `believe`). Deterministic ⇒ unit-testable.
- Ordering: rarer/funnier first (e.g. subscription > undefeated > professional …)
  so the top 1–2 shown are the spiciest.
- All `{count}`-style params drive ICU plurals; cs uses few/other forms.
- Tone is curated: lines tease about effort/quantity, never about identity or
  anything hurtful.
