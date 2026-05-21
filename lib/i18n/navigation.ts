import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

// Locale-aware navigation. next-intl's Link / router / usePathname
// preserve the active locale prefix — a plain `next/link` Link drops it,
// so clicking a bare-path link on an /en/* page bounces the user to the
// default (cs) locale. Always import Link from here, never next/link.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
