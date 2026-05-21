/**
 * i18n:check — the sixth verification gate (constitution v1.4.0).
 *
 * Fails (exit 1) when either:
 *   1. messages/cs.json and messages/en.json have differing key sets.
 *   2. an app/** or components/** .tsx file contains a hardcoded
 *      user-facing string instead of a next-intl catalog lookup.
 *
 * The hardcoded-string scan is deliberately conservative — a perfect
 * detector is undecidable. It flags the v1 failure mode (whole screens
 * of literal English) without drowning the build in false positives.
 * Silence a false positive by extracting the string to the catalog,
 * never by an inline ignore — the pressure must point at the catalog.
 *
 * Run: pnpm i18n:check
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];

// ── 1. Catalog parity ────────────────────────────────────────────────
function flatten(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

function checkCatalogParity(): string[] {
  const cs = JSON.parse(readFileSync(join(ROOT, 'messages/cs.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8'));
  const csKeys = new Set(flatten(cs));
  const enKeys = new Set(flatten(en));
  const problems: string[] = [];
  for (const k of csKeys) if (!enKeys.has(k)) problems.push(`  key in cs.json missing from en.json: ${k}`);
  for (const k of enKeys) if (!csKeys.has(k)) problems.push(`  key in en.json missing from cs.json: ${k}`);
  return problems;
}

// ── 2. Hardcoded user-facing string scan ─────────────────────────────
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

// A literal "looks like prose": has a run of letters and a space or is a
// multi-word phrase — i.e. something a member would read, not an id.
function looksLikeProse(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;
  if (!/[A-Za-z]{2,}/.test(trimmed)) return false; // needs letters
  if (/^[a-z0-9-]+$/.test(trimmed)) return false; // slug / token / class
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return false; // CONSTANT
  return /\s/.test(trimmed) || /[A-Za-z]{4,}/.test(trimmed);
}

const ATTR_RE = /\b(?:placeholder|aria-label|alt|title)\s*=\s*"([^"]+)"/g;
const TOAST_RE = /toast\.(?:success|error|info|warning)\(\s*['"]([^'"]+)['"]/g;
// JSX text node: ">  Some words  <" with no interpolation braces.
const JSX_TEXT_RE = />\s*([A-Za-z][^<>{}]*?)\s*</g;

function scanFile(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const lines = src.split('\n');
  const findings: string[] = [];
  const lineOf = (idx: number) => src.slice(0, idx).split('\n').length;

  for (const re of [ATTR_RE, TOAST_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (looksLikeProse(m[1]!)) {
        findings.push(`  ${rel}:${lineOf(m.index)} — hardcoded "${m[1]}"`);
      }
    }
  }

  // JSX text: skip lines that already resolve through a t(...) call.
  JSX_TEXT_RE.lastIndex = 0;
  let jm: RegExpExecArray | null;
  while ((jm = JSX_TEXT_RE.exec(src)) !== null) {
    const text = jm[1]!;
    const ln = lineOf(jm.index);
    const lineText = lines[ln - 1] ?? '';
    if (looksLikeProse(text) && !/\bt\(/.test(lineText)) {
      findings.push(`  ${rel}:${ln} — hardcoded JSX text "${text.trim()}"`);
    }
  }
  return findings;
}

// ── Run ──────────────────────────────────────────────────────────────
const parity = checkCatalogParity();
const hardcoded = SCAN_DIRS.flatMap((d) => tsxFiles(d)).flatMap(scanFile);

if (parity.length === 0 && hardcoded.length === 0) {
  console.log('i18n:check — OK (catalogs match, no hardcoded user-facing strings)');
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
process.exit(1);
