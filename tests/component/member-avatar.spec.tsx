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

  // Spec 021 — new top-priority branch: uploadUrl wins over every
  // other fallback when set.
  it('renders <img> when uploadUrl is provided (spec 021)', () => {
    const { container } = render(
      <MemberAvatar
        avatarKey="star"
        displayName="Tereza Š."
        uploadUrl="/api/avatar/m1?v=12345"
      />,
    );
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/api/avatar/m1?v=12345');
    // The glyph SVG must NOT be rendered when uploadUrl wins.
    expect(container.querySelector('svg')).not.toBeInTheDocument();
    // Initials text must NOT be rendered either.
    expect(screen.queryByText('TŠ')).not.toBeInTheDocument();
  });

  it('uploadUrl=null falls through to the existing fallback chain (spec 021)', () => {
    render(
      <MemberAvatar avatarKey={null} displayName="Tereza Š." uploadUrl={null} />,
    );
    // With null uploadUrl + null key + non-empty name → initials.
    expect(screen.getByText('TŠ')).toBeInTheDocument();
  });

  // Spec 023 — size variant prop. Default unchanged, two new variants.
  describe('size variants (spec 023)', () => {
    it('defaults to h-9 w-9 (preserves spec 020/021 behavior)', () => {
      const { container } = render(
        <MemberAvatar avatarKey={null} displayName="P" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('h-9');
      expect(wrapper.className).toContain('w-9');
    });

    it('size="row" renders at h-8 w-8', () => {
      const { container } = render(
        <MemberAvatar avatarKey={null} displayName="P" size="row" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('h-8');
      expect(wrapper.className).toContain('w-8');
    });

    it('size="inline" renders at h-5 w-5 with smaller inner glyph', () => {
      const { container } = render(
        <MemberAvatar avatarKey="star" displayName="Pavel" size="inline" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('h-5');
      expect(wrapper.className).toContain('w-5');
      // Inner glyph scaled to h-3 so it fits inside the h-5 wrapper.
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('class')).toContain('h-3');
    });

    it('fallback chain preserved per size — upload wins at every size', () => {
      for (const size of ['default', 'row', 'inline'] as const) {
        const { container, unmount } = render(
          <MemberAvatar
            avatarKey="star"
            displayName="Pavel"
            uploadUrl="/api/avatar/x?v=1"
            size={size}
          />,
        );
        expect(container.querySelector('img')).toBeInTheDocument();
        expect(container.querySelector('svg')).not.toBeInTheDocument();
        unmount();
      }
    });

    it('className still appends on top of the size variant', () => {
      const { container } = render(
        <MemberAvatar avatarKey={null} displayName="P" size="row" className="ml-2" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('ml-2');
      expect(wrapper.className).toContain('h-8');
    });
  });
});
