import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Spec 015 — Vitest+RTL setup file for the component layer.
// Imports jest-dom's custom matchers (toBeInTheDocument, etc.)
// onto Vitest's expect, and unmounts rendered components after
// every test so DOM state doesn't leak between specs.
afterEach(() => {
  cleanup();
});
