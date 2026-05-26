import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';

import { BrandMark } from '@/components/ui/brand-mark';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 015 — canonical sample for the component layer (Vitest + RTL).
// Renders BrandMark with the next-intl provider so the catalog
// lookup `t('brand')` resolves. No webserver, no DB. Sub-100ms run.

describe('BrandMark (component layer — Vitest + RTL)', () => {
  it('renders the brand text in English', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BrandMark />
      </NextIntlClientProvider>,
    );
    // The catalog has `common.brand = "beeromat"`. The component
    // uppercases it via CSS, but the underlying text is lowercase.
    expect(screen.getByText('beeromat')).toBeInTheDocument();
  });

  it('renders the brand text in Czech', () => {
    render(
      <NextIntlClientProvider locale="cs" messages={csMessages}>
        <BrandMark />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('beeromat')).toBeInTheDocument();
  });

  it('renders the beer-mug emoji', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BrandMark />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('🍺')).toBeInTheDocument();
  });
});
