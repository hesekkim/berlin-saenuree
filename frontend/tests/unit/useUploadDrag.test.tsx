import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filesFromDataTransfer,
  isFileDrag,
  useUpload,
  type UploadItem,
  type UseUploadParams,
} from '../../src/shared/components/ui/Upload/useUpload';

vi.mock('../../src/shared/api/mediaApi', () => ({
  uploadMediaFile: vi.fn(async () => ({
    id: 'remote-1',
    url: '/api/v1/media/files/remote-1',
    originalName: 'photo.png',
    contentType: 'image/png',
    sizeBytes: 3,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
  mediaFileAbsoluteUrl: (path: string) => path,
  downloadMediaFile: vi.fn(async () => undefined),
}));

type DragEventInit = {
  files?: File[];
  items?: { kind: string; getAsFile: () => File | null }[];
  types?: string[];
};

function fakeDataTransfer({ files = [], items = [], types }: DragEventInit = {}) {
  return {
    files,
    items,
    types: types ?? (files.length > 0 || items.length > 0 ? ['Files'] : []),
    dropEffect: 'none',
    effectAllowed: 'all',
  };
}

function dispatchDrag(
  target: EventTarget,
  type: string,
  dataTransfer: ReturnType<typeof fakeDataTransfer> | null = fakeDataTransfer()
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function pngFile(name = 'photo.png') {
  return new File(['abc'], name, { type: 'image/png' });
}

function Harness(props: UseUploadParams) {
  const { dropzoneRef, isDragging, items } = useUpload(props);
  return (
    <div
      ref={dropzoneRef}
      data-testid="dropzone"
      data-dragging={String(isDragging)}
    >
      <span data-testid="child">hint</span>
      <span data-testid="items">
        {items.map((item) => `${item.file.name}:${item.status}`).join(',')}
      </span>
    </div>
  );
}

function renderUpload(props: UseUploadParams = {}) {
  render(<Harness {...props} />);
  return {
    dropzone: screen.getByTestId('dropzone'),
    child: screen.getByTestId('child'),
  };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('useUpload drag and drop', () => {
  it('always prevents default on dragover and asks for the copy cursor', () => {
    const { dropzone } = renderUpload();

    const dataTransfer = fakeDataTransfer({ files: [pngFile()] });
    const event = dispatchDrag(dropzone, 'dragover', dataTransfer);

    expect(event.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('still prevents default when dataTransfer reports no types', () => {
    const { dropzone } = renderUpload();

    const dataTransfer = fakeDataTransfer({ types: [] });
    const event = dispatchDrag(dropzone, 'dragover', dataTransfer);

    expect(event.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('refuses the drop while disabled', () => {
    const onItemsChange = vi.fn();
    const { dropzone } = renderUpload({ disabled: true, onItemsChange });

    const dataTransfer = fakeDataTransfer({ files: [pngFile()] });
    dispatchDrag(dropzone, 'dragover', dataTransfer);
    expect(dataTransfer.dropEffect).toBe('none');

    dispatchDrag(dropzone, 'drop', dataTransfer);
    expect(onItemsChange.mock.lastCall?.[0]).toEqual([]);
  });

  it('keeps the active highlight while moving over child elements', () => {
    const { dropzone, child } = renderUpload();

    dispatchDrag(dropzone, 'dragenter');
    expect(dropzone.dataset.dragging).toBe('true');

    dispatchDrag(child, 'dragenter');
    dispatchDrag(child, 'dragleave');
    expect(dropzone.dataset.dragging).toBe('true');

    dispatchDrag(dropzone, 'dragleave');
    expect(dropzone.dataset.dragging).toBe('false');
  });

  it('adds dropped files once and clears the highlight', () => {
    const onItemsChange = vi.fn();
    const { dropzone } = renderUpload({ autoUpload: false, onItemsChange });

    dispatchDrag(dropzone, 'dragenter');
    const dataTransfer = fakeDataTransfer({ files: [pngFile()] });
    const event = dispatchDrag(dropzone, 'drop', dataTransfer);

    expect(event.defaultPrevented).toBe(true);
    expect(dropzone.dataset.dragging).toBe('false');

    const items = onItemsChange.mock.lastCall?.[0] as UploadItem[];
    expect(items).toHaveLength(1);
    expect(items[0].file.name).toBe('photo.png');
  });

  it('keeps uploaded items in progress until async processing completes', async () => {
    let finishProcessing!: () => void;
    const onUploaded = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishProcessing = resolve;
        })
    );
    const { dropzone } = renderUpload({ onUploaded });

    dispatchDrag(
      dropzone,
      'drop',
      fakeDataTransfer({ files: [pngFile()] })
    );

    await waitFor(() => {
      expect(screen.getByTestId('items')).toHaveTextContent(
        'photo.png:uploading'
      );
    });
    expect(onUploaded).toHaveBeenCalledOnce();

    await act(async () => {
      finishProcessing();
    });

    await waitFor(() => {
      expect(screen.getByTestId('items')).toHaveTextContent(
        'photo.png:uploaded'
      );
    });
  });

  it('does not let a drop outside the dropzone navigate away', () => {
    renderUpload();

    const outside = dispatchDrag(document.body, 'dragover', fakeDataTransfer());
    expect(outside.defaultPrevented).toBe(true);

    const dropped = dispatchDrag(document.body, 'drop', fakeDataTransfer());
    expect(dropped.defaultPrevented).toBe(true);
  });
});

describe('filesFromDataTransfer', () => {
  it('prefers the files list', () => {
    const file = pngFile();
    expect(filesFromDataTransfer(fakeDataTransfer({ files: [file] }) as never)).toEqual([
      file,
    ]);
  });

  it('falls back to items when files is empty', () => {
    const file = pngFile('from-items.png');
    const dataTransfer = fakeDataTransfer({
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => file },
      ],
    });

    expect(filesFromDataTransfer(dataTransfer as never)).toEqual([file]);
  });
});

describe('isFileDrag', () => {
  it('treats an empty types list as a possible file drag', () => {
    expect(isFileDrag(fakeDataTransfer({ types: [] }) as never)).toBe(true);
  });

  it('rejects a text-only drag', () => {
    expect(isFileDrag(fakeDataTransfer({ types: ['text/plain'] }) as never)).toBe(
      false
    );
  });
});
