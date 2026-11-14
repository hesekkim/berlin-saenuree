import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePublicPageContent } from '../../src/shared/content/usePublicPageContent';

type TestContent = { title: string };

const fallbackContent = { title: 'fallback' };
const localStorageValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageValues.size;
  },
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => Array.from(localStorageValues.keys())[index] ?? null,
  removeItem: (key) => localStorageValues.delete(key),
  setItem: (key, value) => localStorageValues.set(key, value),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function normalizeContent(value: unknown): TestContent {
  if (
    value &&
    typeof value === 'object' &&
    'title' in value &&
    typeof value.title === 'string'
  ) {
    return { title: value.title };
  }
  return fallbackContent;
}

beforeEach(() => {
  localStorageValues.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePublicPageContent', () => {
  it('keeps bundled fallback content visible when the request fails', async () => {
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePublicPageContent({
        slug: 'test-page',
        fallback: fallbackContent,
        load,
        normalize: normalizeContent,
      }),
    );

    expect(result.current.content).toEqual(fallbackContent);
    await waitFor(() => expect(result.current.hasLoadError).toBe(true));
    expect(result.current.content).toEqual(fallbackContent);
  });

  it('shows cached content immediately and replaces it with fresh content', async () => {
    window.localStorage.setItem(
      'public-page-content:test-page',
      JSON.stringify({ title: 'cached' }),
    );

    const { result } = renderHook(() =>
      usePublicPageContent({
        slug: 'test-page',
        fallback: fallbackContent,
        load: async () => ({ title: 'fresh' }),
        normalize: normalizeContent,
      }),
    );

    expect(result.current.content).toEqual({ title: 'cached' });
    await waitFor(() =>
      expect(result.current.content).toEqual({ title: 'fresh' }),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem('public-page-content:test-page') ?? '{}',
      ),
    ).toEqual({ title: 'fresh' });
  });

  it('ignores an older request that resolves after a newer request', async () => {
    const firstRequest = deferred<unknown>();
    const secondRequest = deferred<unknown>();
    const load = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const { result } = renderHook(() =>
      usePublicPageContent({
        slug: 'test-page',
        fallback: fallbackContent,
        load,
        normalize: normalizeContent,
        refreshOnFocus: true,
      }),
    );

    expect(load).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(load).toHaveBeenCalledTimes(2);

    act(() => secondRequest.resolve({ title: 'latest' }));
    await waitFor(() =>
      expect(result.current.content).toEqual({ title: 'latest' }),
    );
    act(() => firstRequest.resolve({ title: 'old' }));
    await waitFor(() =>
      expect(result.current.content).toEqual({ title: 'latest' }),
    );
    expect(result.current.content).toEqual({ title: 'latest' });
    expect(
      JSON.parse(
        window.localStorage.getItem('public-page-content:test-page') ?? '{}',
      ),
    ).toEqual({ title: 'latest' });
  });
});
