import { setRequestLocale } from 'next-intl/server';

// SCRATCH — visual-direction proposal page (v1.4 redesign).
// Reachable at /design. Not part of the shipped product: it has
// hardcoded copy on purpose and is removed once a direction is chosen.
//
// beeromat is a mobile-first / mobile-only app, so this page is itself
// a single phone-width column, and every theme is shown as real phone
// screens (a welcome screen + the home screen) rendered in that theme.

interface Palette {
  bg: string;
  surface: string;
  primary: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  ink: string;
  muted: string;
  line: string;
}

interface Theme {
  id: string;
  name: string;
  vibe: string;
  heroLine: string;
  font: string;
  palette: Palette;
  swatches: { name: string; hex: string }[];
}

const THEMES: Theme[] = [
  {
    id: 'clubhouse',
    name: 'A · Clubhouse',
    vibe: 'Warm amber, cream and roast brown — the cosy feel of the tavern after the match. Leans into the beer and the matey tone; characterful and inviting.',
    heroLine: 'Beer, banter, and the people you play with.',
    font: 'Bricolage Grotesque',
    palette: {
      bg: '#F6EEDD',
      surface: '#FFFBF3',
      primary: '#B5701A',
      primaryFg: '#FFFBF3',
      accent: '#4B3826',
      accentFg: '#F6EEDD',
      ink: '#2C2114',
      muted: '#8C7B62',
      line: '#E4D7BE',
    },
    swatches: [
      { name: 'Foam Cream', hex: '#F6EEDD' },
      { name: 'Pour White', hex: '#FFFBF3' },
      { name: 'Honey Amber', hex: '#B5701A' },
      { name: 'Roast Brown', hex: '#4B3826' },
      { name: 'Stout Ink', hex: '#2C2114' },
      { name: 'Malt Grey', hex: '#8C7B62' },
    ],
  },
  {
    id: 'court',
    name: 'B · Court',
    vibe: 'Court green, crisp white and an optic-yellow accent — the colour of a tennis ball. Sporty, clean and high-contrast, so it reads well for older eyes on a small screen. The most legible of the three.',
    heroLine: 'After the match, the only scoreboard left is the bar tab.',
    font: 'Geist',
    palette: {
      bg: '#EEF2EA',
      surface: '#FFFFFF',
      primary: '#2F6E3F',
      primaryFg: '#FFFFFF',
      accent: '#C7D636',
      accentFg: '#1E2A14',
      ink: '#1B2A1E',
      muted: '#6E7C6E',
      line: '#DCE4D6',
    },
    swatches: [
      { name: 'Court Mist', hex: '#EEF2EA' },
      { name: 'Line White', hex: '#FFFFFF' },
      { name: 'Court Green', hex: '#2F6E3F' },
      { name: 'Optic Yellow', hex: '#C7D636' },
      { name: 'Baseline Ink', hex: '#1B2A1E' },
      { name: 'Net Grey', hex: '#6E7C6E' },
    ],
  },
  {
    id: 'matchpoint',
    name: 'C · Match Point',
    vibe: 'Tennis green primary, beer gold accent, over a warm off-white that carries the "friends" warmth. Ties all three keywords — tennis, beer, friends — into one identity. The most on-brand for what beeromat actually is.',
    heroLine: 'Tennis. Beer. The mates who show up for both.',
    font: 'Bricolage Grotesque',
    palette: {
      bg: '#F4F1E6',
      surface: '#FFFFFF',
      primary: '#2E6B45',
      primaryFg: '#FFFFFF',
      accent: '#E0A52E',
      accentFg: '#2A2114',
      ink: '#232520',
      muted: '#7B8073',
      line: '#E4DECB',
    },
    swatches: [
      { name: 'Clubhouse Linen', hex: '#F4F1E6' },
      { name: 'Surface White', hex: '#FFFFFF' },
      { name: 'Baseline Green', hex: '#2E6B45' },
      { name: 'Lager Gold', hex: '#E0A52E' },
      { name: 'Match Ink', hex: '#232520' },
      { name: 'Doubles Grey', hex: '#7B8073' },
    ],
  },
];

/** A phone-shaped frame — every preview is shown at phone width. */
function Phone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-center text-[11px] font-medium text-neutral-400">{label}</div>
      <div className="overflow-hidden rounded-[30px] border-4 border-neutral-800 shadow-xl">
        {children}
      </div>
    </div>
  );
}

/** Welcome / hero screen, full phone height, in the theme's colours. */
function HeroScreen({ theme }: { theme: Theme }) {
  const p = theme.palette;
  return (
    <div
      style={{ background: p.primary, color: p.primaryFg }}
      className="flex h-[560px] w-[270px] flex-col justify-between p-7"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">
        🎾 beeromat
      </div>
      <div>
        <div className="text-[34px] font-extrabold leading-[1.1]">
          After the match. Over a beer.
        </div>
        <p className="mt-3 text-[15px] opacity-90">{theme.heroLine}</p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          style={{ background: p.accent, color: p.accentFg }}
          className="rounded-xl py-3.5 text-base font-bold"
        >
          Log a beer
        </button>
        <button
          type="button"
          style={{ borderColor: p.primaryFg, color: p.primaryFg }}
          className="rounded-xl border-2 py-3 text-base font-semibold"
        >
          Tonight&apos;s tab
        </button>
      </div>
    </div>
  );
}

/** The home screen, full phone height, in the theme's colours. */
function HomeScreen({ theme }: { theme: Theme }) {
  const p = theme.palette;
  const beers = [
    { name: 'Pilsner Urquell', price: '52 Kč' },
    { name: 'Kozel Černý', price: '40 Kč' },
  ];
  return (
    <div
      style={{ background: p.bg }}
      className="flex h-[560px] w-[270px] flex-col"
    >
      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
        <div>
          <div style={{ color: p.muted }} className="text-sm">
            Ahoj Tereza 👋
          </div>
          <div style={{ color: p.ink }} className="text-xl font-bold">
            TK Smeč
          </div>
        </div>

        <div
          style={{ background: p.surface, borderColor: p.line }}
          className="rounded-2xl border p-5"
        >
          <div style={{ color: p.muted }} className="text-[11px] uppercase tracking-wide">
            Your tab
          </div>
          <div style={{ color: p.ink }} className="mt-1 text-[34px] font-extrabold">
            240,00&nbsp;Kč
          </div>
          <button
            type="button"
            style={{ background: p.primary, color: p.primaryFg }}
            className="mt-4 w-full rounded-xl py-3 text-base font-semibold"
          >
            Settle up
          </button>
        </div>

        <div>
          <div style={{ color: p.ink }} className="mb-2 text-sm font-semibold">
            Tonight&apos;s round 🍺
          </div>
          <div className="grid grid-cols-2 gap-3">
            {beers.map((b) => (
              <div
                key={b.name}
                style={{ background: p.surface, borderColor: p.line }}
                className="flex h-24 flex-col justify-between rounded-xl border p-3"
              >
                <div style={{ color: p.ink }} className="text-sm font-semibold leading-tight">
                  {b.name}
                </div>
                <div
                  style={{ background: p.accent, color: p.accentFg }}
                  className="self-start rounded-full px-2 py-0.5 text-xs font-bold"
                >
                  {b.price}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{ background: p.surface, borderColor: p.line }}
        className="flex border-t"
      >
        {['Home', 'Log', 'Tab', 'Bets'].map((item, i) => (
          <div
            key={item}
            style={{ color: i === 0 ? p.primary : p.muted }}
            className="flex-1 py-3 text-center text-xs font-medium"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeShowcase({ theme }: { theme: Theme }) {
  const p = theme.palette;
  return (
    <section className="border-t border-neutral-200 px-5 py-9">
      <h2 className="text-xl font-bold text-neutral-900">{theme.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{theme.vibe}</p>
      <p className="mt-1 text-xs text-neutral-500">Display typeface: {theme.font}</p>

      {/* Palette — compact grid that fits a phone column */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {theme.swatches.map((s) => (
          <div key={s.hex}>
            <div
              style={{ background: s.hex, borderColor: p.line }}
              className="h-12 rounded-md border"
            />
            <div className="mt-1 text-[11px] font-semibold leading-tight text-neutral-800">
              {s.name}
            </div>
            <div className="font-mono text-[10px] text-neutral-500">{s.hex}</div>
          </div>
        ))}
      </div>

      {/* The theme as real phone screens */}
      <div className="mt-7 flex flex-col items-center gap-7">
        <Phone label="Welcome">
          <HeroScreen theme={theme} />
        </Phone>
        <Phone label="Home">
          <HomeScreen theme={theme} />
        </Phone>
      </div>
    </section>
  );
}

export default async function DesignProposalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto min-h-screen max-w-[420px] bg-neutral-50 pb-16">
      <header className="px-5 pt-12 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
          beeromat · v1.4 redesign
        </div>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">Pick a visual direction</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Three proposed looks, built around <strong>beer</strong>, <strong>friends</strong> and{' '}
          <strong>tennis</strong>. Each shows its colour palette and two real phone screens —
          a welcome screen and the home screen — rendered in that theme. Tell me which one
          (A, B or C — or a mix) and I&apos;ll spec the v1.4 redesign around it.
        </p>
      </header>

      {THEMES.map((theme) => (
        <ThemeShowcase key={theme.id} theme={theme} />
      ))}
    </main>
  );
}
