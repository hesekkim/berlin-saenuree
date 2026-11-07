import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deleteMediaFile = vi.fn();

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteMediaFile: (...args: unknown[]) => deleteMediaFile(...args),
}));

const { MEDIA_DELETE_GRACE_MS, useMediaOwnership } = await import(
  '../../src/shared/components/ui/RichTextEditorEX/useMediaOwnership'
);

type FakeEditor = {
  state: { doc: { descendants: (fn: (node: unknown) => void) => void } };
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  emitUpdate: () => void;
};

/**
 * Minimal stand-in for the TipTap editor: only the `update` event and the
 * media ids currently in the document matter to the hook.
 */
function makeEditor(initialIds: string[]) {
  let mediaIds = [...initialIds];
  const handlers = new Set<() => void>();
  const editor: FakeEditor = {
    state: {
      doc: {
        descendants: (fn) => {
          mediaIds.forEach((mediaId) => fn({ attrs: { mediaId } }));
        },
      },
    },
    on: (event, handler) => {
      if (event === 'update') {
        handlers.add(handler);
      }
    },
    off: (event, handler) => {
      if (event === 'update') {
        handlers.delete(handler);
      }
    },
    emitUpdate: () => {
      handlers.forEach((handler) => handler());
    },
  };
  return {
    editor,
    setMediaIds: (next: string[]) => {
      mediaIds = next;
      editor.emitUpdate();
    },
    /** A programmatic setContent changes the doc without emitting `update`. */
    replaceWithoutUpdate: (next: string[]) => {
      mediaIds = next;
    },
  };
}

function renderOwnership(initialIds: string[] = []) {
  const doc = makeEditor(initialIds);
  const view = renderHook(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useMediaOwnership(doc.editor as any),
  );
  return { ...doc, ...view };
}

describe('useMediaOwnership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteMediaFile.mockReset();
    deleteMediaFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes a tracked file once it leaves the document', async () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));

    act(() => view.setMediaIds([]));
    expect(deleteMediaFile).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_DELETE_GRACE_MS);
    });
    expect(deleteMediaFile).toHaveBeenCalledWith('a');
  });

  it('keeps the file when an undo restores the node within the grace period', async () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));

    act(() => view.setMediaIds([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_DELETE_GRACE_MS / 2);
    });
    act(() => view.setMediaIds(['a']));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_DELETE_GRACE_MS * 2);
    });

    expect(deleteMediaFile).not.toHaveBeenCalled();
    expect(view.result.current.getTrackedIds()).toEqual(['a']);
  });

  it('ignores a programmatic content replacement', async () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));

    act(() => view.replaceWithoutUpdate([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_DELETE_GRACE_MS * 2);
    });

    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it('stops tracking after commit so a saved post keeps its media', async () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));
    act(() => view.result.current.commit());

    act(() => view.setMediaIds([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEDIA_DELETE_GRACE_MS * 2);
    });

    expect(deleteMediaFile).not.toHaveBeenCalled();
    expect(view.result.current.getTrackedIds()).toEqual([]);
  });

  it('deletes every tracked file on discardAll', async () => {
    const view = renderOwnership(['a', 'b']);
    act(() => {
      view.result.current.track('a');
      view.result.current.track('b');
    });

    await act(async () => {
      await view.result.current.discardAll();
    });

    expect(deleteMediaFile.mock.calls.map(([id]) => id).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(view.result.current.getTrackedIds()).toEqual([]);
  });

  it('flushes a pending deletion on unmount instead of orphaning the file', async () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));
    act(() => view.setMediaIds([]));

    act(() => view.unmount());

    expect(deleteMediaFile).toHaveBeenCalledWith('a');
  });

  it('keeps media that is still in the document when unmounting', () => {
    const view = renderOwnership(['a']);
    act(() => view.result.current.track('a'));

    act(() => view.unmount());

    expect(deleteMediaFile).not.toHaveBeenCalled();
  });
});
