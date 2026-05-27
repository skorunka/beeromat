import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { BeerTile } from '@/components/log/beer-tile';

// Spec 026 T002 — component test for the shared h-16 BeerTile.

const seedBeer = { id: 'b-pilsner', name: 'Pilsner' };

describe('BeerTile (component layer — spec 026)', () => {
  it('renders the beer name', () => {
    render(<BeerTile beer={seedBeer} selected={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Pilsner' })).toBeInTheDocument();
  });

  it('renders at h-16 with the unselected base classes', () => {
    const { container } = render(
      <BeerTile beer={seedBeer} selected={false} onClick={() => {}} />,
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('h-16');
    expect(btn.className).toContain('border-input');
    expect(btn.className).toContain('bg-background');
  });

  it('selected state applies the primary trio classes + aria-pressed=true', () => {
    const { container } = render(
      <BeerTile beer={seedBeer} selected={true} onClick={() => {}} />,
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('text-primary-foreground');
    expect(btn.className).toContain('border-primary');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('click fires onClick', () => {
    const onClick = vi.fn();
    render(<BeerTile beer={seedBeer} selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pilsner' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled prevents click + applies opacity-50', () => {
    const onClick = vi.fn();
    const { container } = render(
      <BeerTile beer={seedBeer} selected={false} onClick={onClick} disabled />,
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('opacity-50');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('className prop appends to the wrapper without breaking base classes', () => {
    const { container } = render(
      <BeerTile beer={seedBeer} selected={false} onClick={() => {}} className="ml-2" />,
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('ml-2');
    expect(btn.className).toContain('h-16');
  });

  it('truncates long beer names (single-line text)', () => {
    const longBeer = { id: 'b-long', name: 'Pivovar Kout na Šumavě 12° světlý ležák' };
    render(<BeerTile beer={longBeer} selected={false} onClick={() => {}} />);
    const span = screen.getByText(/Pivovar Kout/);
    expect(span.className).toContain('truncate');
  });
});
