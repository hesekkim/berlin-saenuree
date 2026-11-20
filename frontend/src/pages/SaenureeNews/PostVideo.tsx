import { useCallback, useEffect, useRef } from 'react';
import { mediaFileAbsoluteUrl } from '../../shared/api/mediaApi';
import { seekVideoToPreviewFrame } from '../../shared/lib/videoPreview';

type PostVideoProps = {
  fileId: string;
  className: string;
  controls: boolean;
  onPreviewReady?: () => void;
  onError?: () => void;
};

export default function PostVideo({
  fileId,
  className,
  controls,
  onPreviewReady,
  onError,
}: PostVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeekingRef = useRef(false);
  const isReadyRef = useRef(false);
  const onPreviewReadyRef = useRef(onPreviewReady);
  onPreviewReadyRef.current = onPreviewReady;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) {
        video.pause();
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const reportReady = useCallback((video: HTMLVideoElement) => {
    if (isReadyRef.current) {
      return;
    }
    isReadyRef.current = true;
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => onPreviewReadyRef.current?.());
    } else {
      requestAnimationFrame(() => onPreviewReadyRef.current?.());
    }
  }, []);

  return (
    <video
      ref={videoRef}
      className={className}
      src={mediaFileAbsoluteUrl(`/api/v1/media/files/${fileId}`)}
      autoPlay
      muted
      loop
      playsInline
      controls={controls}
      preload="auto"
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        const previousTime = video.currentTime;
        seekVideoToPreviewFrame(video);
        isSeekingRef.current = video.currentTime !== previousTime;
        if (!isSeekingRef.current && video.readyState >= 2) {
          reportReady(video);
        }
      }}
      onLoadedData={(event) => {
        if (!isSeekingRef.current) {
          reportReady(event.currentTarget);
        }
      }}
      onSeeked={(event) => {
        isSeekingRef.current = false;
        reportReady(event.currentTarget);
      }}
      onError={onError}
    />
  );
}
