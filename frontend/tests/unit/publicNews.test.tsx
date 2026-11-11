import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PhotoNews from '../../src/pages/SaenureeNews/PhotoNews';
import ChurchStories from '../../src/pages/SaenureeNews/ChurchStories';
import type { PublicBloggerResponse } from '../../src/shared/api/bloggerApi';
import type { PublicPostResponse } from '../../src/shared/api/postsApi';

const mocks = vi.hoisted(() => ({
  fetchPosts: vi.fn(),
  fetchBlogger: vi.fn(),
  fetchBloggerItem: vi.fn(),
}));

vi.mock('../../src/shared/api/postsApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/shared/api/postsApi')>();
  return { ...actual, fetchPublicPosts: mocks.fetchPosts };
});

vi.mock('../../src/shared/api/bloggerApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/shared/api/bloggerApi')>();
  return {
    ...actual,
    fetchPublicBlogger: mocks.fetchBlogger,
    fetchPublicBloggerItem: mocks.fetchBloggerItem,
  };
});

vi.mock('../../src/shared/context/ConfigContext', () => ({
  useConfig: () => ({
    language: 'en',
    defaultLanguage: 'en',
  }),
}));

const posts: PublicPostResponse[] = [
  {
    id: 'post-1',
    createdAt: '2026-06-01T10:00:00Z',
    images: [
      { imageId: 'image-1', width: 640, height: 480 },
      { imageId: 'image-1-second', width: 640, height: 480 },
    ],
    copies: { en: { body: '<p>First caption</p>' } },
  },
  {
    id: 'post-2',
    createdAt: '2026-06-02T10:00:00Z',
    images: [{ imageId: 'image-2', width: 640, height: 480 }],
    copies: { en: { body: '<p>Second caption</p>' } },
  },
];

const story: PublicBloggerResponse = {
  id: 'story-1',
  createdAt: '2026-06-03T10:00:00Z',
  copies: {
    en: { title: 'Church story', body: '<p>Story body</p>' },
  },
};

function renderWithQueries(element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {element}
    </QueryClientProvider>,
  );
}

describe('Saenuree News public pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPosts.mockResolvedValue({
      items: posts,
      total: posts.length,
      limit: 30,
      offset: 0,
    });
    mocks.fetchBlogger.mockResolvedValue({
      items: [story],
      total: 1,
      limit: 30,
      offset: 0,
    });
    mocks.fetchBloggerItem.mockResolvedValue(story);
  });

  it('opens a post dialog and navigates to another post', async () => {
    renderWithQueries(<PhotoNews />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Jun 1, 2026' }))[0],
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('First caption')).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Next post' }),
    );

    const updatedDialog = await screen.findByRole('dialog');
    expect(within(updatedDialog).getByText('Second caption')).toBeInTheDocument();
  });

  it('shows photo indicators and only the available carousel direction', async () => {
    const { container } = renderWithQueries(<PhotoNews />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Jun 1, 2026' }))[0],
    );
    const viewer = await screen.findByRole('dialog');
    expect(
      within(viewer).queryByRole('button', { name: 'Previous photo' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(viewer).getByRole('button', { name: '2 / 2' }),
    );
    const photoTrack = viewer.querySelector('[class*="photoTrack"]');
    expect(photoTrack).not.toBeNull();
    if (photoTrack) {
      fireEvent.animationEnd(photoTrack);
    }

    expect(
      within(viewer).queryByRole('button', { name: 'Next photo' }),
    ).not.toBeInTheDocument();
    expect(
      within(viewer).getByRole('button', { name: 'Previous photo' }),
    ).toBeInTheDocument();
    expect(within(viewer).getByRole('group', { name: '2 / 2' })).toBeInTheDocument();
    expect(screen.getByText('Jun 1, 2026')).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="multiImageIcon"]')).toHaveLength(1);
  });

  it('shows a mobile vertical feed with swipeable photos instead of a dialog', async () => {
    cleanup();
    const originalMatchMedia = window.matchMedia;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(max-width: 760px)',
        addEventListener,
        removeEventListener,
      })),
    });

    const { unmount } = renderWithQueries(<PhotoNews />);
    try {
      expect(await screen.findByText('First caption')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Jun 1, 2026')).toBeInTheDocument();

      const photoGroup = screen.getByRole('group', { name: '1 / 2' });
      fireEvent.touchStart(photoGroup, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchEnd(photoGroup, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      expect(screen.getByRole('group', { name: '2 / 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2 / 2' })).toHaveAttribute(
        'aria-current',
        'true',
      );
    } finally {
      unmount();
      if (originalMatchMedia) {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          value: originalMatchMedia,
        });
      } else {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    }
  });

  it('closes on dialog background clicks but not photo clicks', async () => {
    renderWithQueries(<PhotoNews />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Jun 1, 2026' }))[0],
    );
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('img'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a published church story from the list', async () => {
    renderWithQueries(
      <MemoryRouter initialEntries={['/saenuree-news/blogger']}>
        <Routes>
          <Route path="/saenuree-news/blogger" element={<ChurchStories />} />
          <Route path="/saenuree-news/blogger/:id" element={<ChurchStories />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('link', { name: /Church story/ }),
    );

    expect(await screen.findByText('Story body')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Church Stories' }),
    ).toBeInTheDocument();
    expect(mocks.fetchBloggerItem).toHaveBeenCalledWith('story-1');
  });

  it('paginates church stories by ten items', async () => {
    mocks.fetchBlogger.mockImplementation(
      ({ offset = 0 }: { offset?: number }) =>
        Promise.resolve({
          items:
            offset === 0
              ? Array.from({ length: 10 }, (_, index) => ({
                  ...story,
                  id: `story-${index + 1}`,
                }))
              : [{ ...story, id: 'story-11', copies: { en: { title: 'Newest story', body: '<p>Newest body</p>' } } }],
          total: 11,
          limit: 10,
          offset,
        }),
    );

    renderWithQueries(
      <MemoryRouter initialEntries={['/saenuree-news/blogger']}>
        <Routes>
          <Route path="/saenuree-news/blogger" element={<ChurchStories />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findAllByRole('link', { name: /Church story/ })).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('link', { name: /Newest story/ })).toBeInTheDocument();
    expect(mocks.fetchBlogger).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 10,
    });
  });
});
