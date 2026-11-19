import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VisitMediaEditor from '../../src/pages/Admin/Pages/Visit/VisitMediaEditor';

afterEach(cleanup);

vi.mock('../../src/shared/components/ui/Upload/Upload', () => ({
  default: () => null,
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  mediaImageAbsoluteUrl: (imageId: string) => `/media/${imageId}`,
}));

const images = ['one', 'two', 'three'].map((imageId) => ({
  imageId,
  sourceFileId: `source-${imageId}`,
}));

describe('VisitMediaEditor', () => {
  it('reorders images with keyboard controls and announces the new position', () => {
    const onReorder = vi.fn();
    render(
      <VisitMediaEditor
        title="Venue photos"
        hint="Optional photos"
        images={images}
        disabled={false}
        uploadKey="venue"
        removeImageLabel="Remove photo {number}"
        removeImageConfirmTitle="Remove photo"
        removeImageConfirmMessage="Remove photo {number}?"
        cancelLabel="Cancel"
        confirmRemoveImageLabel="Remove"
        closeLabel="Close"
        selectImageLabel="Reorder photo {number}"
        reorderHint="Use arrows to reorder."
        imageMovedLabel="Photo {image} moved to position {position}."
        uploadLabels={{}}
        onUploaded={vi.fn()}
        onItemsChange={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder photo 1' }), {
      key: 'ArrowRight',
    });

    expect(onReorder).toHaveBeenLastCalledWith([
      images[1],
      images[0],
      images[2],
    ]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Photo 1 moved to position 2.',
    );
    expect(
      screen.getByRole('button', { name: 'Reorder photo 2' }),
    ).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder photo 2' }), {
      key: 'End',
    });
    expect(onReorder).toHaveBeenLastCalledWith([
      images[0],
      images[2],
      images[1],
    ]);
  });

  it('requires confirmation before removing a photo', () => {
    const onRemove = vi.fn();
    render(
      <VisitMediaEditor
        title="Venue photos"
        hint="Optional photos"
        images={images}
        disabled={false}
        uploadKey="venue"
        removeImageLabel="Remove photo {number}"
        removeImageConfirmTitle="Remove photo"
        removeImageConfirmMessage="Remove photo {number}?"
        cancelLabel="Cancel"
        confirmRemoveImageLabel="Remove"
        closeLabel="Close"
        selectImageLabel="Reorder photo {number}"
        reorderHint="Use arrows to reorder."
        imageMovedLabel="Photo {image} moved to position {position}."
        uploadLabels={{}}
        onUploaded={vi.fn()}
        onItemsChange={vi.fn()}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    expect(screen.getByRole('dialog', { name: 'Remove photo' })).toBeVisible();
    expect(screen.getByText('Remove photo 1?')).toBeVisible();
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith('one');
  });
});
