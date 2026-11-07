import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminLayout } from '../../src/pages/Admin/layout/useAdminLayout';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={children} />
        <Route path="/admin/settings" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useAdminLayout', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1023'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('toggles drawer open state', () => {
    const { result } = renderHook(() => useAdminLayout(), { wrapper });

    expect(result.current.isDrawerOpen).toBe(false);

    act(() => {
      result.current.openDrawer();
    });
    expect(result.current.isDrawerOpen).toBe(true);

    act(() => {
      result.current.closeDrawer();
    });
    expect(result.current.isDrawerOpen).toBe(false);
  });
});
