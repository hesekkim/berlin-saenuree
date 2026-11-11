import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisitPageEditor } from '../../src/pages/Admin/Pages/Visit/useVisitPageEditor';
import type { VisitCopy } from '../../src/shared/content/visitContent';

const mocks = vi.hoisted(() => ({
  fetchDocument: vi.fn(),
  saveDocument: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  optimizeMediaImage: vi.fn(),
  deleteMediaFile: vi.fn(),
  deleteOptimizedImage: vi.fn(),
}));

vi.mock('../../src/shared/api/cmsApi', () => ({
  fetchEditablePageDocument: mocks.fetchDocument,
  saveEditablePageDocument: mocks.saveDocument,
}));

vi.mock('../../src/shared/api/mediaApi', () => ({
  deleteMediaFile: mocks.deleteMediaFile,
  deleteOptimizedImage: mocks.deleteOptimizedImage,
  optimizeMediaImage: mocks.optimizeMediaImage,
}));

vi.mock('../../src/shared/context/ConfigContext', () => ({
  useConfig: () => ({ availableLanguages: ['en', 'ko', 'de'] }),
}));

vi.mock('../../src/shared/context/CmsConfigContext', () => ({
  useCmsConfig: () => ({ language: 'en' }),
}));

vi.mock('../../src/shared/components/ui/Toast/ToastProvider', () => ({
  useToast: () => ({
    info: mocks.toastInfo,
    warning: vi.fn(),
    error: mocks.toastError,
    dismiss: vi.fn(),
  }),
}));

const englishContent: VisitCopy = {
  services: [
    {
      id: 'sunday-service',
      name: 'Sunday Service',
      day: 'Sunday',
      time: '11:30',
      place: 'GROSSER SAAL',
    },
    {
      id: 'sunday-school',
      name: 'Sunday School',
      day: 'Sunday',
      time: '11:30',
      place: 'GROSSER SAAL',
    },
    {
      id: 'morning-prayer',
      name: 'Morning Prayer',
      day: 'Monday–Saturday',
      time: '07:00',
      place: 'GROSSER SAAL',
    },
  ],
  address: 'Borsigstraße 5, 10115 Berlin',
  primaryTransit: [
    {
      id: 's-bahn',
      type: 'S-Bahn',
      line: 'S1 · S2',
      station: 'Nordbahnhof',
      walkingTime: '4 min walk',
    },
    {
      id: 'u-bahn',
      type: 'U-Bahn',
      line: 'U6',
      station: 'Oranienburger Tor',
      walkingTime: '7 min walk',
    },
  ],
  secondaryTransit: [
    {
      id: 'tram',
      type: 'Tram',
      line: 'M5',
      station: 'Oranienburger Tor',
      walkingTime: '6 min walk',
    },
    {
      id: 'bus',
      type: 'Bus',
      line: '142',
      station: 'Tucholskystraße',
      walkingTime: '2 min walk',
    },
  ],
  googleMapsUrl: 'https://www.google.com/maps/place/church',
};

const sharedMedia = {
  mapImages: ['map-small', 'map-normal', 'map-medium', 'map-large'].map(
    (imageId) => ({ imageId, sourceFileId: `source-${imageId}` }),
  ),
  venueImages: ['church1', 'church2', 'church3', 'church4'].map((imageId) => ({
    imageId,
    sourceFileId: `source-${imageId}`,
  })),
};

describe('useVisitPageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.fetchDocument.mockResolvedValue({
      contentRevision: 7,
      content: { en: englishContent },
      sharedMedia,
    });
    mocks.optimizeMediaImage.mockImplementation(async (sourceFileId: string) => ({
      imageId: `optimized-${sourceFileId}`,
      sourceFileId,
    }));
  });

  it('shares entry structure across languages while keeping field values localized', async () => {
    const { result } = renderHook(() => useVisitPageEditor());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.current.services).toEqual(englishContent.services);
    expect(result.current.current.primaryTransit).toEqual(
      englishContent.primaryTransit,
    );
    expect(result.current.current.secondaryTransit).toEqual(
      englishContent.secondaryTransit,
    );

    act(() => {
      result.current.addService();
      result.current.addTransit('primaryTransit');
      result.current.addTransit('secondaryTransit');
    });

    const addedService = result.current.current.services.at(-1)!;
    const addedPrimaryRoute = result.current.current.primaryTransit.at(-1)!;
    const addedSecondaryRoute =
      result.current.current.secondaryTransit.at(-1)!;
    expect(addedService).toMatchObject({
      name: '',
      day: '',
      time: '',
      place: '',
    });
    expect(addedPrimaryRoute).toMatchObject({
      type: '',
      line: '',
      station: '',
      walkingTime: '',
    });

    act(() => result.current.setLanguage('ko'));
    expect(result.current.current.services.map((service) => service.id)).toEqual([
      ...englishContent.services.map((service) => service.id),
      addedService.id,
    ]);
    expect(result.current.current.services.at(-1)).toMatchObject({
      name: '',
      day: '',
      time: '',
      place: '',
    });
    expect(
      result.current.current.primaryTransit.map((route) => route.id),
    ).toContain(addedPrimaryRoute.id);
    expect(
      result.current.current.secondaryTransit.map((route) => route.id),
    ).toContain(addedSecondaryRoute.id);

    act(() => result.current.setLanguage('en'));
    act(() => {
      result.current.updateService(addedService.id, 'name', 'Evening Service');
      result.current.updateTransit(
        'primaryTransit',
        addedPrimaryRoute.id,
        'line',
        'S3',
      );
      result.current.removeService(addedService.id);
      result.current.removeTransit('primaryTransit', addedPrimaryRoute.id);
      result.current.removeTransit(
        'secondaryTransit',
        addedSecondaryRoute.id,
      );
    });

    expect(result.current.current.services).toEqual(englishContent.services);
    expect(result.current.current.primaryTransit).toEqual(
      englishContent.primaryTransit,
    );
    expect(result.current.current.secondaryTransit).toEqual(
      englishContent.secondaryTransit,
    );

    act(() => result.current.setLanguage('ko'));
    act(() => result.current.addService());
    expect(result.current.current.services).toHaveLength(
      englishContent.services.length + 1,
    );
    expect(result.current.current.services.at(-1)).toMatchObject({
      name: '',
      day: '',
      time: '',
      place: '',
    });
    const sharedServiceId = result.current.current.services.at(-1)!.id;
    act(() => result.current.setLanguage('en'));
    expect(result.current.current.services).toEqual([
      ...englishContent.services,
      {
        id: sharedServiceId,
        name: '',
        day: '',
        time: '',
        place: '',
      },
    ]);
  });

  it('saves editable map screenshots and venue photos in shared media', async () => {
    mocks.saveDocument.mockImplementationOnce(async (_slug, document) => ({
      ...document,
      sharedMedia: document.sharedMedia,
    }));
    const { result } = renderHook(() => useVisitPageEditor());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.imagesDraft.mapImages).toHaveLength(4);
    expect(result.current.imagesDraft.venueImages).toHaveLength(4);
    act(() =>
      result.current.reorderImages('mapImages', [
        result.current.imagesDraft.mapImages[1],
        result.current.imagesDraft.mapImages[0],
        ...result.current.imagesDraft.mapImages.slice(2),
      ]),
    );
    act(() =>
      result.current.removeImage(
        'venueImages',
        result.current.imagesDraft.venueImages[0].imageId,
      ),
    );

    expect(result.current.isDirty).toBe(true);
    await act(async () => result.current.save());

    expect(mocks.saveDocument).toHaveBeenCalledWith(
      'visit',
      expect.objectContaining({
        sharedMedia: {
          mapImages: expect.arrayContaining([
            expect.objectContaining({
              imageId: 'map-normal',
              sourceFileId: 'source-map-normal',
            }),
            expect.objectContaining({
              imageId: 'map-small',
              sourceFileId: 'source-map-small',
            }),
          ]),
          venueImages: expect.not.arrayContaining([
            expect.objectContaining({ imageId: 'church1' }),
          ]),
        },
      }),
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('tracks every uploaded image and recovers unsaved media after a reload', async () => {
    const firstUpload = {
      id: 'source-new-1',
      url: '/media/source-new-1',
      originalName: 'first.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 100,
    };
    const secondUpload = {
      ...firstUpload,
      id: 'source-new-2',
      originalName: 'second.jpg',
    };
    const thirdUpload = {
      ...firstUpload,
      id: 'source-new-3',
      originalName: 'third.jpg',
    };
    const { result, unmount } = renderHook(() => useVisitPageEditor());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.handleImageUploaded('venueImages', [
        firstUpload,
        secondUpload,
      ]);
      await result.current.handleImageUploaded('mapImages', [thirdUpload]);
    });

    expect(result.current.imagesDraft.venueImages.slice(-2)).toEqual([
      {
        imageId: 'optimized-source-new-1',
        sourceFileId: 'source-new-1',
      },
      {
        imageId: 'optimized-source-new-2',
        sourceFileId: 'source-new-2',
      },
    ]);
    act(() =>
      result.current.removeImage('mapImages', 'optimized-source-new-3'),
    );
    await waitFor(() => {
      expect(mocks.deleteOptimizedImage).toHaveBeenCalledWith(
        'optimized-source-new-3',
      );
      expect(mocks.deleteMediaFile).toHaveBeenCalledWith('source-new-3');
    });

    unmount();
    renderHook(() => useVisitPageEditor());
    await waitFor(() => {
      expect(mocks.deleteOptimizedImage).toHaveBeenCalledWith(
        'optimized-source-new-1',
      );
      expect(mocks.deleteOptimizedImage).toHaveBeenCalledWith(
        'optimized-source-new-2',
      );
      expect(mocks.deleteMediaFile).toHaveBeenCalledWith('source-new-1');
      expect(mocks.deleteMediaFile).toHaveBeenCalledWith('source-new-2');
    });
    expect(
      window.sessionStorage.getItem('cms.visit.pending-media.v1'),
    ).toBeNull();
  });
});
