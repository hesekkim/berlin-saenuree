import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VisitMediaEditor from '../../src/pages/Admin/Pages/Visit/VisitMediaEditor';

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
});
