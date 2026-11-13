import { describe, expect, it } from 'vitest';
import { seekVideoToPreviewFrame } from '../../src/shared/lib/videoPreview';

function createVideo({
  duration,
  readyState = 1,
}: {
  duration: number;
  readyState?: number;
}): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    duration: { configurable: true, value: duration },
    readyState: { configurable: true, value: readyState },
    currentTime: { configurable: true, writable: true, value: 0 },
  });
  return video;
}

describe('seekVideoToPreviewFrame', () => {
  it('skips the opening frame to avoid black intro frames', () => {
    const video = createVideo({ duration: 10 });

    seekVideoToPreviewFrame(video);

    expect(video.currentTime).toBe(1.5);
  });

  it('keeps the seek within the duration of a very short video', () => {
    const video = createVideo({ duration: 0.06 });

    seekVideoToPreviewFrame(video);

    expect(video.currentTime).toBe(0.03);
  });

  it('does not seek backward when already at a later frame', () => {
    const video = createVideo({ duration: 10, readyState: 2 });
    video.currentTime = 2;

    seekVideoToPreviewFrame(video);

    expect(video.currentTime).toBe(2);
  });
});
