/**
 * forms:check — the seventh verification gate (constitution v1.5.0,
 * "User Input & Forms").
 *
 * Fails (exit 1) when an app/** or components/** .tsx file contains a
 * browser-native input-handling construct that v1.2 forbids:
 *   G1  a native date/time input — type="date" | "time" | "datetime-local"
 *       (they render inconsistently and ignore the app locale).
 *   G2  the `required` attribute on a control (it is what triggers the
 *       browser's unstyled, locale-blind native validation bubble).
 *   G3  the `pattern` attribute on a control (also triggers native
 *       validation).
 *
 * Allowed and NOT flagged: `maxLength` (caps length, no bubble — the PIN
 * field uses it), `inputMode`, and `type="tel|email|number"` (keyboard /
 * semantics hints, not validation popups).
 *
 * The scan is heuristic — comments are blanked first to avoid false
 * positives. Run: pnpm forms:check
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];

/** Blank out comment bodies, preserving newlines + offsets so line
 *  numbers stay accurate. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

const NATIVE_DATETIME_RE = /\btype\s*=\s*["'](date|time|datetime-local)["']/g;
// `required` as a JSX boolean/prop: word-bounded, followed by `=`, `/>`,
// `>`, or another attribute — but not `required:` (an object key).
const REQUIRED_RE = /(?<![\w$.])required(?![\w$])\s*(?:=|\/?>|[A-Za-z])/g;
const PATTERN_RE = /(?<![\w$.])pattern\s*=\s*["'{]/g;

/**
 * Find native-form-handling violations in one file's source. Exported so
 * the verification gate's behaviour can be unit-tested directly.
 */
export function findFormViolations(rel: string, rawSrc: string): string[] {
  const src = blankComments(rawSrc);
  const findings: string[] = [];

  for (const [re, label] of [
    [NATIVE_DATETIME_RE, 'native date/time input'],
    [REQUIRED_RE, 'native `required` attribute'],
    [PATTERN_RE, 'native `pattern` attribute'],
  ] as const) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      findings.push(`  ${rel}:${lineOf(src, m.index)} — ${label}`);
    }
  }
  return findings;
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

function main(): void {
  const files = SCAN_DIRS.flatMap((d) => tsxFiles(d));
  const findings = files.flatMap((rel) =>
    findFormViolations(rel.replace(/\\/g, '/'), readFileSync(join(ROOT, rel), 'utf8')),
  );

  if (findings.length === 0) {
    console.log('forms:check — OK (no native date/time inputs, no native validation attributes)');
    process.exit(0);
  }
  console.error(`forms:check — FAILED (${findings.length}):`);
  for (const f of findings) console.error(f);
  process.exit(1);
}

// Run only when executed directly — importing this module (e.g. from the
// unit test) must not trigger the scan or process.exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
