import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';

import { FunLines } from '@/components/stats/fun-line';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

describe('FunLines (component — spec 034)', () => {
  it('renders a filled line (en)', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <FunLines lines={[{ key: 'funline.undefeated', params: { count: 6 } }]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/Undefeated in 6/)).toBeInTheDocument();
  });

  it('renders Czech plural forms', () => {
    render(
      <NextIntlClientProvider locale="cs" messages={csMessages}>
        <FunLines lines={[{ key: 'funline.payUp', params: { name: 'Pepa', count: 3 } }]} />
      </NextIntlClientProvider>,
    );
    // cs "few" form: "3 piva"
    expect(screen.getByText(/Pepa 3 piva/)).toBeInTheDocument();
  });

  it('renders at most the top 2 lines', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <FunLines
          lines={[
            { key: 'funline.undefeated', params: { count: 4 } },
            { key: 'funline.professional', params: { avg: 4.2 } },
            { key: 'funline.sugarDaddy', params: { count: 12 } },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/Undefeated/)).toBeInTheDocument();
    expect(screen.getByText(/Averages 4.2/)).toBeInTheDocument();
    expect(screen.queryByText(/sugar daddy/i)).not.toBeInTheDocument();
  });

  it('renders nothing when there are no lines', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <FunLines lines={[]} />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
