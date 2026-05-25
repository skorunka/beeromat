import { beforeMount } from '@playwright/experimental-ct-react/hooks';

import '@/app/globals.css';

// Spec 015 — Playwright CT mount entry point. Imports the project's
// global Tailwind stylesheet so component tests see the same CSS as
// production. `beforeMount` is exported (empty) so future setup (e.g.,
// wrapping every component in an i18n provider) has a place to live.

beforeMount(async () => {
  // No global wrappers needed today; per-test specs handle their own
  // providers (e.g., NextIntlClientProvider) inside the mount call.
});
