import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostVideo from '../../src/pages/SaenureeNews/PostVideo';

class TestIntersectionObserver {
  static instance: TestIntersectionObserver;

  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instance = this;
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          target,
          isIntersecting,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

vi.mock('../../src/shared/api/mediaApi', () => ({
  mediaFileAbsoluteUrl: (url: string) => url,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PostVideo', () => {
  it('pauses when the video leaves the viewport', () => {
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    const { container } = render(
      <PostVideo fileId="video-1" className="video" controls />,
    );
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    expect(TestIntersectionObserver.instance.observe).toHaveBeenCalledWith(
      video,
    );

    act(() => {
      TestIntersectionObserver.instance.trigger(video!, false);
    });
    expect(pause).toHaveBeenCalledOnce();

    act(() => {
      TestIntersectionObserver.instance.trigger(video!, true);
    });
    expect(pause).toHaveBeenCalledOnce();
  });
});
