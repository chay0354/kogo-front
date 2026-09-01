import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSidebarPreference,
  resolveContentOffset,
  resolveSidebarMode,
  writeSidebarPreference,
} from './sidebarShell';

function withStorage(storage: unknown) {
  vi.stubGlobal('window', { localStorage: storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('how wide the office menu sits', () => {
  it('narrows to a rail on a desktop rather than disappearing', () => {
    expect(resolveSidebarMode(true, false)).toBe('rail');
  });

  it('takes a drawer off the edge of a phone', () => {
    expect(resolveSidebarMode(false, false)).toBe('hidden');
  });

  it('tells an open desk from an open phone, which do not close the same way', () => {
    expect(resolveSidebarMode(true, true)).toBe('expanded');
    expect(resolveSidebarMode(false, true)).toBe('drawer');
  });
});

describe('the room a page is given', () => {
  it('follows the menu down to the width of the rail', () => {
    expect(resolveContentOffset('expanded')).toBe('lg:ms-64');
    expect(resolveContentOffset('rail')).toBe('lg:ms-16');
  });

  it("claims none of a phone's width, where the drawer lies over the page", () => {
    expect(resolveContentOffset('hidden')).toBe('');
    expect(resolveContentOffset('drawer')).toBe('');
  });
});

describe('remembering the choice', () => {
  it('reads back what was last asked for', () => {
    withStorage({ getItem: () => 'false' });
    expect(readSidebarPreference(true)).toBe(false);
  });

  it('opens for someone who has never chosen', () => {
    withStorage({ getItem: () => null });
    expect(readSidebarPreference(true)).toBe(true);
  });

  it('still renders when the browser refuses to be read', () => {
    withStorage({
      getItem: () => {
        throw new Error('storage is disabled');
      },
    });
    expect(readSidebarPreference(true)).toBe(true);
  });

  it('still renders when the browser refuses to be written to', () => {
    withStorage({
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => writeSidebarPreference(false)).not.toThrow();
  });

  it('writes the choice as it was made', () => {
    const setItem = vi.fn();
    withStorage({ setItem });
    writeSidebarPreference(false);
    expect(setItem).toHaveBeenCalledWith('kogo-sidebar-open', 'false');
  });
});
