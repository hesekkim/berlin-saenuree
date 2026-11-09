import { describe, expect, it } from 'vitest';
import { getYouTubeVideoId } from '../../src/pages/Home/youtubeVideo';

describe('getYouTubeVideoId', () => {
  it('accepts a video ID and standard YouTube URLs', () => {
    expect(getYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(
      getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')
    ).toBe('dQw4w9WgXcQ');
    expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      getYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
  });

  it('rejects invalid IDs, non-YouTube hosts, and insecure URLs', () => {
    expect(getYouTubeVideoId('not a video')).toBeNull();
    expect(
      getYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')
    ).toBeNull();
    expect(
      getYouTubeVideoId('http://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBeNull();
  });
});
