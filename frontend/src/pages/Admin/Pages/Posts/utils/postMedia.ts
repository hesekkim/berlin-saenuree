export const MAX_POST_MEDIA = 30;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_ACCEPT = 'video/mp4,.mp4';
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const POST_MEDIA_ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;

export function getPostMediaMaxBytes(file: File): number {
  return file.type === 'video/mp4' ||
    file.name.toLowerCase().endsWith('.mp4')
    ? VIDEO_MAX_BYTES
    : IMAGE_MAX_BYTES;
}

export function readVideoDimensions(
  file: File,
  signal?: AbortSignal,
): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      signal?.removeEventListener('abort', handleAbort);
      video.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Video metadata reading was aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });
    video.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height } = video;
      cleanup();
      if (width < 1 || height < 1) {
        reject(new Error('Invalid video dimensions'));
        return;
      }
      resolve({ width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video metadata'));
    };
    video.src = objectUrl;
  });
}
