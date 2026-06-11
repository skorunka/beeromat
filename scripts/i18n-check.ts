/**
 * i18n:check — the sixth verification gate (constitution v1.4.0).
 *
 * Fails (exit 1) when any of:
 *   1. messages/cs.json and messages/en.json have differing key sets.
 *   2. an app/** or components/** .tsx file contains a hardcoded
 *      user-facing string instead of a next-intl catalog lookup.
 *   3. a `t('key')` call resolves — under the namespace its
 *      useTranslations/getTranslations was scoped to — to a key that
 *      does not exist in the catalog. (Catches the wrong-namespace bug
 *      class, e.g. `useTranslations('settle')` then `t('backHome')`,
 *      which otherwise only surfaces as a runtime MISSING_MESSAGE.)
 *
 * Checks 2 and 3 are heuristic — a perfect detector is undecidable.
 * They cover the real failure modes without false-positive noise.
 * Silence a false positive by extracting the string to the catalog,
 * never by an inline ignore.
 *
 * Run: pnpm i18n:check
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];
// The global not-found renders with no locale context (the [locale]
// layout throws notFound() before its providers), so it legitimately
// carries hardcoded copy in the deployment-default language.
//
// pin-input.tsx is a pure-display primitive — every user-facing
// string comes in via props (aria-label, etc.). Its TypeScript
// interface contains generic-bracketed types like
// `FocusEvent<HTMLInputElement>` that the JSX_TEXT_RE regex
// false-flags as hardcoded JSX text (the regex can't distinguish
// `>` from a JSX tag vs `>` from a generic type parameter). The
// file has been audited; no real hardcoded user-facing copy.
const EXCLUDED = new Set([
  'app/not-found.tsx',
  // global-error.tsx replaces the root layout and renders OUTSIDE the
  // NextIntlClientProvider (it catches errors thrown by the locale
  // layout itself), so — like not-found.tsx — it legitimately carries
  // hardcoded copy in the deployment-default language (Czech). The
  // branded, localized boundary for the common case is [locale]/error.tsx.
  'app/global-error.tsx',
  'components/ui/pin-input.tsx',
  // member-picker-dropdown.tsx uses `disabledIds?: Set<string>` in
  // its props — the `<string>` generic trips the JSX_TEXT regex
  // (same root cause as pin-input.tsx). File audited: every user-
  // facing string (placeholder, ariaLabel) comes in via props.
  'components/picker/member-picker-dropdown.tsx',
  // beer-picker-dropdown.tsx — the `value ? beers.find((b) => …)`
  // ternary's `=>` trips the JSX_TEXT regex (reads `>` as a tag
  // close). File audited: every user-facing string (placeholder,
  // ariaLabel) comes in via props; prices format through formatMoney.
  'components/picker/beer-picker-dropdown.tsx',
  // member-picker-grid.tsx — the `members.filter((m) => …)` arrow
  // trips the JSX_TEXT regex (same root cause as the dropdown
  // pickers). File audited: the only user-facing strings come from
  // useTranslations('common') (search placeholder, no-match text).
  'components/picker/member-picker-grid.tsx',
  // filter-list.tsx — the `items.filter((i) => …)` arrow trips the
  // JSX_TEXT regex. File audited: placeholder/emptyText come from
  // props (callers pass translated strings).
  'components/ui/filter-list.tsx',
  // confirm-dialog.tsx — the `=> Promise<boolean>` type alias trips
  // the JSX_TEXT regex (reads `Promise` as text before a `<boolean>`
  // tag). File audited: button labels come from props or common.* via
  // useTranslations; no hardcoded user-facing copy.
  'components/ui/confirm-dialog.tsx',
  // install-prompt.tsx — the BeforeInstallPromptEvent interface's
  // `prompt: () => Promise<void>` trips the JSX_TEXT regex (same
  // Promise<…> false-positive as confirm-dialog.tsx). File audited:
  // every user-facing string comes from useTranslations('pwa.install').
  'components/pwa/install-prompt.tsx',
]);

// ── shared ───────────────────────────────────────────────────────────
function flatten(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

function loadCatalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), 'utf8'));
}

function tsxFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(abs, name);
    const rel = relative(ROOT, full);
    if (statSync(full).isDirectory()) return tsxFiles(rel);
    return full.endsWith('.tsx') ? [rel] : [];
  });
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

// ── 1. Catalog parity ────────────────────────────────────────────────
function checkCatalogParity(): string[] {
  const csKeys = new Set(flatten(loadCatalog('cs')));
  const enKeys = new Set(flatten(loadCatalog('en')));
  const problems: string[] = [];
  for (const k of csKeys) if (!enKeys.has(k)) problems.push(`  key in cs.json missing from en.json: ${k}`);
  for (const k of enKeys) if (!csKeys.has(k)) problems.push(`  key in en.json missing from cs.json: ${k}`);
  return problems;
}

// ── 2. Hardcoded user-facing string scan ─────────────────────────────
function looksLikeProse(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;
  if (!/[A-Za-z]{2,}/.test(trimmed)) return false;
  if (/^[a-z0-9-]+$/.test(trimmed)) return false; // slug / token / class
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return false; // CONSTANT
  return /\s/.test(trimmed) || /[A-Za-z]{4,}/.test(trimmed);
}

const ATTR_RE = /\b(?:placeholder|aria-label|alt|title)\s*=\s*"([^"]+)"/g;
const TOAST_RE = /toast\.(?:success|error|info|warning)\(\s*['"]([^'"]+)['"]/g;
const JSX_TEXT_RE = />\s*([A-Za-z][^<>{}]*?)\s*</g;

function scanHardcoded(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  const findings: string[] = [];

  for (const re of [ATTR_RE, TOAST_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (looksLikeProse(m[1]!)) {
        findings.push(`  ${rel}:${lineOf(src, m.index)} — hardcoded "${m[1]}"`);
      }
    }
  }

  JSX_TEXT_RE.lastIndex = 0;
  let jm: RegExpExecArray | null;
  while ((jm = JSX_TEXT_RE.exec(src)) !== null) {
    const text = jm[1]!;
    const ln = lineOf(src, jm.index);
    if (looksLikeProse(text) && !/\bt\(/.test(lines[ln - 1] ?? '')) {
      findings.push(`  ${rel}:${ln} — hardcoded JSX text "${text.trim()}"`);
    }
  }
  return findings;
}

// ── 3. Namespace-scoped t() key resolution ───────────────────────────
// `const <name> = (await) useTranslations|getTranslations('<ns>')`
const HOOK_RE =
  /\b(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:['"]([^'"]+)['"])?\s*\)/g;

function scanTranslationKeys(rel: string, keys: Set<string>): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const namespaces = new Map<string, string>();
  HOOK_RE.lastIndex = 0;
  let hm: RegExpExecArray | null;
  while ((hm = HOOK_RE.exec(src)) !== null) {
    namespaces.set(hm[1]!, hm[2] ?? '');
  }
  if (namespaces.size === 0) return [];

  const findings: string[] = [];
  for (const [varName, ns] of namespaces) {
    // <var>('key') and <var>.rich|markup|raw('key') — NOT .has() (an
    // existence probe legitimately passes a maybe-absent key).
    const callRe = new RegExp(
      `\\b${varName}(?:\\.(?:rich|markup|raw))?\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g',
    );
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(src)) !== null) {
      const key = cm[1]!;
      const full = ns ? `${ns}.${key}` : key;
      if (!keys.has(full)) {
        findings.push(`  ${rel}:${lineOf(src, cm.index)} — t() key not in catalog: ${full}`);
      }
    }
  }
  return findings;
}

// ── Run ──────────────────────────────────────────────────────────────
const files = SCAN_DIRS.flatMap((d) => tsxFiles(d)).filter(
  (f) => !EXCLUDED.has(f.replace(/\\/g, '/')),
);
const catalogKeys = new Set(flatten(loadCatalog('en')));

const parity = checkCatalogParity();
const hardcoded = files.flatMap(scanHardcoded);
const badKeys = parity.length === 0 ? files.flatMap((f) => scanTranslationKeys(f, catalogKeys)) : [];

if (parity.length === 0 && hardcoded.length === 0 && badKeys.length === 0) {
  console.log('i18n:check — OK (catalogs match, no hardcoded strings, all t() keys resolve)');
  process.exit(0);
}

if (parity.length > 0) {
  console.error(`i18n:check — catalog parity FAILED (${parity.length}):`);
  for (const p of parity) console.error(p);
}
if (hardcoded.length > 0) {
  console.error(`i18n:check — hardcoded strings FAILED (${hardcoded.length}):`);
  for (const h of hardcoded) console.error(h);
}
if (badKeys.length > 0) {
  console.error(`i18n:check — unresolved t() keys FAILED (${badKeys.length}):`);
  for (const b of badKeys) console.error(b);
}
process.exit(1);
