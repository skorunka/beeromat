import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { StopRowNavigation } from '@/components/history/stop-row-navigation';

// Spec 022 follow-up — StopRowNavigation wraps an editable subtree
// inside a parent Link so clicks/keys on the subtree don't bubble
// up and trigger navigation. Used on /history list so the
// SessionTitleInlineEdit's edit button + input doesn't navigate
// to the detail page when tapped.

describe('StopRowNavigation (component layer — spec 022 follow-up)', () => {
  it('click events inside DO NOT bubble to the parent', () => {
    const outerClick = vi.fn();
    const { getByTestId } = render(
      <div onClick={outerClick}>
        <StopRowNavigation>
          <button type="button" data-testid="inner">tap</button>
        </StopRowNavigation>
      </div>,
    );
    fireEvent.click(getByTestId('inner'));
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('mousedown events inside DO NOT bubble (prevents :active flash on row)', () => {
    const outerMouseDown = vi.fn();
    const { getByTestId } = render(
      <div onMouseDown={outerMouseDown}>
        <StopRowNavigation>
          <button type="button" data-testid="inner">tap</button>
        </StopRowNavigation>
      </div>,
    );
    fireEvent.mouseDown(getByTestId('inner'));
    expect(outerMouseDown).not.toHaveBeenCalled();
  });

  it('keydown events inside DO NOT bubble (prevents Enter/Esc reaching the link)', () => {
    const outerKeyDown = vi.fn();
    const { getByTestId } = render(
      <div onKeyDown={outerKeyDown}>
        <StopRowNavigation>
          <input type="text" data-testid="inner" />
        </StopRowNavigation>
      </div>,
    );
    fireEvent.keyDown(getByTestId('inner'), { key: 'Enter' });
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it('clicks OUTSIDE the wrapper still bubble normally', () => {
    const outerClick = vi.fn();
    const { getByTestId } = render(
      <div onClick={outerClick}>
        <StopRowNavigation>
          <button type="button">inside</button>
        </StopRowNavigation>
        <button type="button" data-testid="sibling">outside</button>
      </div>,
    );
    fireEvent.click(getByTestId('sibling'));
    expect(outerClick).toHaveBeenCalledTimes(1);
  });

  it('inner click handler still fires (the wrapper does not preventDefault)', () => {
    const innerClick = vi.fn();
    const { getByTestId } = render(
      <StopRowNavigation>
        <button type="button" data-testid="inner" onClick={innerClick}>
          tap
        </button>
      </StopRowNavigation>,
    );
    fireEvent.click(getByTestId('inner'));
    expect(innerClick).toHaveBeenCalledTimes(1);
  });
});
