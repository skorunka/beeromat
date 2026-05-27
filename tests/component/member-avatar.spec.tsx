import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { MemberAvatar } from '@/components/ui/member-avatar';

// Spec 020 T016 — render-path coverage for the three fallback rules.

describe('MemberAvatar (component layer — spec 020)', () => {
  it('renders the picked SVG glyph when avatarKey is a valid palette key', () => {
    const { container } = render(
      <MemberAvatar avatarKey="star" displayName="Tereza Š." />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden');
    // No initials text rendered alongside.
    expect(screen.queryByText(/TŠ/i)).not.toBeInTheDocument();
  });

  it('falls back to initials when avatarKey is null', () => {
    render(<MemberAvatar avatarKey={null} displayName="Tereza Š." />);
    expect(screen.getByText('TŠ')).toBeInTheDocument();
  });

  it('falls back to initials when avatarKey is unknown (defensive)', () => {
    render(<MemberAvatar avatarKey="removed-in-v3" displayName="Pavel" />);
    // 'Pavel' has a single token → two-letter slice "PA".
    expect(screen.getByText('PA')).toBeInTheDocument();
  });

  it('falls back to the CircleUser icon when displayName is empty + no key', () => {
    const { container } = render(<MemberAvatar avatarKey={null} displayName="" />);
    // CircleUser is a lucide svg with no aria-label; we assert there's
    // exactly one svg in the rendered tree and no text.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.textContent).toBe('');
  });

  it('renders the icon even when avatarKey is empty string (defensive)', () => {
    render(<MemberAvatar avatarKey="" displayName="Tereza Š." />);
    // Empty string is not a valid key → falls back to initials.
    expect(screen.getByText('TŠ')).toBeInTheDocument();
  });
});
