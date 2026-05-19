// Global Vitest setup file. Runs once per test file.

import '@testing-library/jest-dom/vitest';

// `server-only` would otherwise throw when test code imports modules
// that are normally server-side. Stub it to a no-op import.
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
