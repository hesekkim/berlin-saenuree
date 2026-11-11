import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VisitPageEditor from '../../src/pages/Admin/Pages/Visit/VisitPageEditor';
import { getVisitAdminLabels } from '../../src/pages/Admin/Pages/Visit/visitAdminLabels';

const mocks = vi.hoisted(() => ({
  editor: vi.fn(),
  mediaMounted: vi.fn(),
  mediaUnmounted: vi.fn(),
}));

vi.mock('../../src/pages/Admin/Pages/Visit/useVisitPageEditor', () => ({
  useVisitPageEditor: mocks.editor,
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en' }),
}));

vi.mock('../../src/shared/components/ui/Select/Select', () => ({
  default: () => null,
}));

vi.mock('../../src/shared/components/ui/InputField/InputField', () => ({
  default: ({ label, value }: { label: string; value: string }) => (
    <input aria-label={label} value={value} readOnly />
  ),
}));

vi.mock('../../src/shared/components/ui/Dialog/Dialog', () => ({
  default: () => null,
}));

vi.mock('../../src/pages/Admin/Pages/Visit/VisitMediaEditor', async () => {
  const { useEffect } = await import('react');
  function MockVisitMediaEditor() {
    useEffect(() => {
      mocks.mediaMounted();
      return () => mocks.mediaUnmounted();
    }, []);
    return <div data-testid="visit-media-editor" />;
  }

  return {
    default: MockVisitMediaEditor,
  };
});

describe('VisitPageEditor tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const labels = getVisitAdminLabels('en');
    mocks.editor.mockReturnValue({
      labels,
      current: {
        services: [
          {
            id: 'sunday-service',
            name: 'Sunday Service',
            day: 'Sunday',
            time: '11:30',
            place: 'GROSSER SAAL',
          },
        ],
        address: 'Borsigstraße 5',
        primaryTransit: [],
        secondaryTransit: [],
        googleMapsUrl: '',
      },
      editLanguageOptions: [],
      editLanguage: 'en',
      setLanguage: vi.fn(),
      isReady: true,
      isSaving: false,
      isImageUploading: false,
      isImageOptimizing: false,
      isImageCleaning: false,
      loadFailed: false,
      reload: vi.fn(),
      addService: vi.fn(),
      removeService: vi.fn(),
      updateService: vi.fn(),
      updateField: vi.fn(),
      addTransit: vi.fn(),
      removeTransit: vi.fn(),
      updateTransit: vi.fn(),
      imagesDraft: { mapImages: [], venueImages: [] },
      uploadEpoch: { mapImages: 0, venueImages: 0 },
      removeImage: vi.fn(),
      reorderImages: vi.fn(),
      handleImageUploaded: vi.fn(),
      handleImageItemsChange: vi.fn(),
      imageUploadFailed: false,
      hasInvalidMapLink: false,
      isDirty: true,
      save: vi.fn(),
      conflict: null,
      dismissConflict: vi.fn(),
      reloadLatest: vi.fn(),
    });
  });

  it('keeps both panels mounted and uses one save action across tab switches', () => {
    const { container } = render(<VisitPageEditor />);
    const servicesTab = screen.getByRole('tab', { name: 'Service schedule' });
    const locationTab = screen.getByRole('tab', {
      name: 'Location information',
    });
    const servicesPanel = screen.getByRole('tabpanel', {
      name: 'Service schedule',
    });
    const locationPanel = container.querySelector(
      '[role="tabpanel"][id$="-location-panel"]',
    )!;
    const addressField = container.querySelector(
      'input[aria-label="Address"]',
    )!;

    expect(servicesPanel).not.toHaveAttribute('hidden');
    expect(locationPanel).toHaveAttribute('hidden');
    expect(mocks.mediaMounted).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(servicesTab, { key: 'ArrowRight' });
    expect(locationTab).toHaveAttribute('aria-selected', 'true');
    expect(servicesPanel).toHaveAttribute('hidden');
    expect(locationPanel).not.toHaveAttribute('hidden');
    expect(container.querySelector('input[aria-label="Address"]')).toBe(
      addressField,
    );
    expect(mocks.mediaUnmounted).not.toHaveBeenCalled();

    fireEvent.click(servicesTab);
    expect(servicesPanel).not.toHaveAttribute('hidden');
    expect(locationPanel).toHaveAttribute('hidden');
    fireEvent.click(locationTab);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.editor().save).toHaveBeenCalledTimes(1);
    expect(mocks.mediaMounted).toHaveBeenCalledTimes(2);
    expect(mocks.mediaUnmounted).not.toHaveBeenCalled();
  });
});
