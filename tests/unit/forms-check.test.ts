import { describe, it, expect } from 'vitest';

import { findFormViolations } from '@/scripts/forms-check';

// v1.2 US4 — the forms:check guardrail.
// The gate fails the build on a native date/time input or a native
// browser-validation attribute; this exercises its scan logic directly.

describe('forms:check gate — findFormViolations', () => {
  it('flags a native date input (G1)', () => {
    expect(findFormViolations('x.tsx', '<input type="date" />')).toHaveLength(1);
  });

  it('flags native time and datetime-local inputs (G1)', () => {
    expect(findFormViolations('x.tsx', '<input type="time" />')).toHaveLength(1);
    expect(findFormViolations('x.tsx', '<input type="datetime-local" />')).toHaveLength(1);
  });

  it('flags the native required attribute (G2)', () => {
    expect(findFormViolations('x.tsx', '<Input required />')).toHaveLength(1);
    expect(findFormViolations('x.tsx', '<Input required autoFocus />')).toHaveLength(1);
    expect(findFormViolations('x.tsx', '<Input required={true} />')).toHaveLength(1);
  });

  it('flags the native pattern attribute (G3)', () => {
    expect(findFormViolations('x.tsx', '<input pattern="\\d+" />')).toHaveLength(1);
  });

  it('passes a form that uses only allowed attributes', () => {
    const clean =
      '<Input type="email" inputMode="numeric" maxLength={4} autoComplete="email" />';
    expect(findFormViolations('x.tsx', clean)).toHaveLength(0);
  });

  it('does not flag the words in comments or unrelated identifiers', () => {
    expect(
      findFormViolations('x.tsx', '// the name is required\nconst isRequired = true;'),
    ).toHaveLength(0);
    expect(
      findFormViolations('x.tsx', '/* pattern matching */\nconst requiredFields = [];'),
    ).toHaveLength(0);
    // An object key named `required` is not a JSX attribute.
    expect(findFormViolations('x.tsx', 'const opts = { required: true };')).toHaveLength(0);
  });
});
