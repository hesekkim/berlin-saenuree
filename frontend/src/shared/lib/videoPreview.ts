export function seekVideoToPreviewFrame(video: HTMLVideoElement): void {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return;
  }
  const previewTime = Math.min(
    video.duration / 2,
    Math.max(1, Math.min(3, video.duration * 0.15)),
  );
  if (video.currentTime < previewTime) {
    video.currentTime = previewTime;
  }
}
