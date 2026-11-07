import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useTrashAccess } from '../../src/pages/Admin/Pages/Trash/hooks/useTrashAccess';

const authState: { role: string | null; effectivePages: string[] } = {
  role: null,
  effectivePages: [],
};

vi.mock('../../src/shared/context/AuthContext', () => ({
  useAuth: () => authState,
}));

function renderWithRoute(initialEntry: string) {
  return renderHook(() => useTrashAccess(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    ),
  });
}

describe('useTrashAccess', () => {
  it('defaults to the posts tab when no type is requested and posts is accessible', () => {
    authState.role = 'page_manager';
    authState.effectivePages = ['posts', 'blogger'];

    const { result } = renderWithRoute('/admin/pages/trash');

    expect(result.current.activeTab).toBe('posts');
    expect(result.current.canViewPosts).toBe(true);
    expect(result.current.canViewBlogger).toBe(true);
  });

  it('falls back to blogger when posts is not accessible', () => {
    authState.role = 'page_manager';
    authState.effectivePages = ['blogger'];

    const { result } = renderWithRoute('/admin/pages/trash?type=posts');

    expect(result.current.activeTab).toBe('blogger');
    expect(result.current.canViewPosts).toBe(false);
    expect(result.current.canViewBlogger).toBe(true);
  });

  it('honors an accessible requested tab', () => {
    authState.role = 'site_admin';
    authState.effectivePages = [];

    const { result } = renderWithRoute('/admin/pages/trash?type=blogger');

    expect(result.current.activeTab).toBe('blogger');
  });

  it('switches tabs via setActiveTab', () => {
    authState.role = 'site_admin';
    authState.effectivePages = [];

    const { result } = renderWithRoute('/admin/pages/trash?type=posts');

    act(() => {
      result.current.setActiveTab('blogger');
    });

    expect(result.current.activeTab).toBe('blogger');
  });

  it('restores the previous tab when navigating back', () => {
    authState.role = 'site_admin';
    authState.effectivePages = [];

    const { result } = renderHook(
      () => ({ ...useTrashAccess(), navigate: useNavigate() }),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/admin/pages/trash?type=posts']}>
            {children}
          </MemoryRouter>
        ),
      },
    );

    act(() => {
      result.current.setActiveTab('blogger');
    });
    expect(result.current.activeTab).toBe('blogger');

    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.activeTab).toBe('posts');
  });
});
