const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

export function getYouTubeVideoId(value: string): string | null {
  const input = value.trim();
  if (VIDEO_ID_PATTERN.test(input)) {
    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }

  const path = url.pathname.split('/').filter(Boolean);
  const candidate =
    url.hostname === 'youtu.be'
      ? path[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(path[0] ?? '')
          ? path[1]
          : null;

  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}
