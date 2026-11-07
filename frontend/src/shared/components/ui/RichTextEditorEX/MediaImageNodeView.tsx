import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { mediaFileAbsoluteUrl } from '../../../api/mediaApi';
import {
  MAX_MEDIA_WIDTH,
  MIN_MEDIA_WIDTH,
  mediaFileUrl,
  normalizeMediaWidth,
} from '../../../lib/richText';
import styles from './RichTextEditorEX.module.css';

const WIDTH_STEP = 16;
type ResizeDirection = 'start' | 'end';

function clampWidth(width: number): number {
  return Math.min(
    MAX_MEDIA_WIDTH,
    Math.max(MIN_MEDIA_WIDTH, Math.round(width)),
  );
}

export default function MediaImageNodeView({
  node,
  editor,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    direction: ResizeDirection;
  } | null>(null);
  // Drag updates this only; the document is not touched until pointerup.
  // Committing width on every pointermove dispatches a ProseMirror
  // transaction, which re-serializes the whole doc to HTML in `onUpdate`
  // and makes the drag stutter.
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const mediaId = String(node.attrs.mediaId ?? '');
  const imageId = String(node.attrs.imageId ?? '');
  const alt = String(node.attrs.alt ?? '');
  const width = normalizeMediaWidth(node.attrs.width);
  const displayWidth = previewWidth ?? width;
  const canResize = editor.isEditable;

  const getCurrentWidth = () =>
    width ?? imageRef.current?.getBoundingClientRect().width ?? MIN_MEDIA_WIDTH;

  const getMaxWidth = () =>
    Math.min(MAX_MEDIA_WIDTH, editor.view.dom.clientWidth || MAX_MEDIA_WIDTH);

  const resolveWidth = (nextWidth: number) =>
    Math.min(getMaxWidth(), clampWidth(nextWidth));

  const commitWidth = (nextWidth: number) => {
    updateAttributes({ width: resolveWidth(nextWidth) });
  };

  // Clear the local preview only once the committed attrs actually reflect
  // it, so the image never flashes back to the pre-drag width for a frame.
  useEffect(() => {
    if (previewWidth !== null && width === previewWidth) {
      setPreviewWidth(null);
    }
  }, [previewWidth, width]);

  const startResize = (event: PointerEvent, direction: ResizeDirection) => {
    if (!canResize) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: getCurrentWidth(),
      direction,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: PointerEvent) => {
    const activeResize = resizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    const sign = activeResize.direction === 'end' ? 1 : -1;
    setPreviewWidth(
      resolveWidth(
        activeResize.startWidth + (event.clientX - activeResize.startX) * sign,
      ),
    );
  };

  const finishResize = (event: PointerEvent) => {
    if (resizeRef.current?.pointerId === event.pointerId) {
      resizeRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (previewWidth !== null) {
        commitWidth(previewWidth);
      }
    }
  };

  const adjustWidth = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const amount = event.key === 'ArrowRight' ? WIDTH_STEP : -WIDTH_STEP;
    commitWidth(getCurrentWidth() + amount);
  };

  return (
    <NodeViewWrapper
      as="span"
      className={[styles.imageNode, selected ? styles.imageNodeSelected : '']
        .filter(Boolean)
        .join(' ')}
      data-media-node="image"
      contentEditable={false}
    >
      <img
        ref={imageRef}
        className="rich-text-media-image"
        data-media-id={mediaId}
        data-image-id={imageId || undefined}
        data-media-width={width ?? undefined}
        src={
          imageId
            ? mediaFileAbsoluteUrl(`/api/v1/media/images/${imageId}/display`)
            : mediaFileAbsoluteUrl(mediaFileUrl(mediaId))
        }
        alt={alt}
        width={displayWidth ?? undefined}
      />
      {canResize && selected ? (
        <button
          type="button"
          className={styles.imageResizeHandle}
          aria-label="Resize image"
          onKeyDown={adjustWidth}
          onPointerDown={(event) => startResize(event, 'end')}
          onPointerMove={resize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
