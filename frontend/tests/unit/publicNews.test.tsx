import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
    media: [
      { type: 'image', imageId: 'image-1', width: 640, height: 480 },
      { type: 'image', imageId: 'image-1-second', width: 640, height: 480 },
    ],
    copies: { en: { body: '<p>First caption</p>' } },
  },
  {
    id: 'post-2',
    createdAt: '2026-06-02T10:00:00Z',
    media: [{ type: 'video', fileId: 'video-2', width: 1280, height: 720 }],
    copies: { en: { body: '<p>Second caption</p>' } },
  },
];
const firstPostImages = posts[0].media;

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
    cleanup();
    vi.clearAllMocks();
    posts[0].media = [...firstPostImages];
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
    const video = updatedDialog.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveProperty('muted', true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('controls');
  });

  it('loads the next post page when navigating past the loaded grid items', async () => {
    const firstPagePosts = Array.from({ length: 30 }, (_, index) => ({
      ...posts[0],
      id: `page-post-${index}`,
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      copies: { en: { body: `<p>Caption ${index + 1}</p>` } },
    }));
    const nextPagePost: PublicPostResponse = {
      ...posts[1],
      id: 'page-post-30',
      copies: { en: { body: '<p>Caption 31</p>' } },
    };
    mocks.fetchPosts.mockImplementation(
      async ({ offset = 0 }: { offset?: number } = {}) =>
        offset === 0
          ? {
              items: firstPagePosts,
              total: 31,
              limit: 30,
              offset: 0,
            }
          : {
              items: [nextPagePost],
              total: 31,
              limit: 30,
              offset: 30,
            },
    );

    renderWithQueries(<PhotoNews />);
    const gridPosts = await screen.findAllByRole('button');
    fireEvent.click(gridPosts[gridPosts.length - 1]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Caption 30')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next post' }));

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText('Caption 31')).toBeInTheDocument();
    });
    expect(mocks.fetchPosts).toHaveBeenLastCalledWith({
      limit: 30,
      offset: 30,
    });
  });

  it('keeps the current photo visible until the next video frame is ready', async () => {
    posts[0].media = [
      ...firstPostImages,
      { type: 'video', fileId: 'video-next', width: 640, height: 480 },
    ];

    renderWithQueries(<PhotoNews />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Jun 1, 2026' }))[0],
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '3 / 3' }));

    const video = dialog.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).not.toHaveAttribute('controls');
    expect(within(dialog).getByRole('status')).toBeInTheDocument();
    expect(dialog.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('image-1'),
    );

    if (!video) {
      throw new Error('Expected the next video to be mounted');
    }
    Object.defineProperties(video, {
      duration: { configurable: true, value: 8 },
      currentTime: { configurable: true, writable: true, value: 0 },
      readyState: { configurable: true, value: 1 },
      requestVideoFrameCallback: {
        configurable: true,
        value: (callback: () => void) => callback(),
      },
    });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(1.2);
    fireEvent.seeked(video);

    const videoLayer = video.closest('[class*="mediaLayer"]');
    expect(videoLayer).not.toBeNull();
    await waitFor(() => {
      expect(videoLayer?.className).toContain('mediaLayerSlideInNext');
    });
    expect(
      dialog.querySelector('img')?.parentElement?.parentElement?.className,
    ).toContain('mediaLayerSlideOutNext');

    await waitFor(() => {
      expect(dialog.querySelector('video')).toHaveAttribute('controls');
    }, { timeout: 1500 });
    expect(dialog.querySelector('img')).not.toBeInTheDocument();
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
