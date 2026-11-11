import { describe, expect, it } from 'vitest';
import {
  hasCompleteChurchHistoryContent,
  normalizeChurchHistoryContent,
  resolveChurchHistoryCopy,
  serializeChurchHistoryContent,
} from '../../src/shared/content/churchHistoryContent';

describe('church history content helpers', () => {
  it('requires complete event content in every available language before saving', () => {
    const content = normalizeChurchHistoryContent({
      ko: {
        events: [
          {
            id: 'future-event',
            date: '2024.01.01',
            description: '새 연혁',
          },
        ],
      },
      en: {
        events: [
          {
            id: 'future-event',
            date: '2024.01.01',
            description: 'A new event',
          },
        ],
      },
      de: {
        events: [
          {
            id: 'future-event',
            date: '2024.01.01',
            description: 'Ein neues Ereignis',
          },
        ],
      },
    }, [], {
      events: {
        'future-event': {
          imageId: 'optimized-image',
          sourceFileId: 'source-file',
        },
      },
    });

    expect(
      hasCompleteChurchHistoryContent(content, ['ko', 'en', 'de']),
    ).toBe(true);
    const germanEvent = content.de.events[0];
    expect(
      hasCompleteChurchHistoryContent(
        { ...content, de: { events: [{ ...germanEvent, description: '' }] } },
        ['ko', 'en', 'de'],
      ),
    ).toBe(false);
    expect(
      hasCompleteChurchHistoryContent(
        { ...content, de: { events: [{ ...germanEvent, date: '' }] } },
        ['ko', 'en', 'de'],
      ),
    ).toBe(false);
    expect(
      hasCompleteChurchHistoryContent(
        { ...content, de: { events: [{ ...germanEvent, imageId: '' }] } },
        ['ko', 'en', 'de'],
      ),
    ).toBe(false);
    expect(
      hasCompleteChurchHistoryContent(
        { ...content, de: undefined },
        ['ko', 'en', 'de'],
      ),
    ).toBe(false);
    expect(hasCompleteChurchHistoryContent(content, [])).toBe(false);
  });

  it('uses the English copy when the requested language is empty', () => {
    const copy = {
      events: [
        {
          id: 'founding',
          date: '2013.05.12',
          description: 'First service',
          imageUrl: '/images/founding.png',
          imageId: '',
          sourceFileId: '',
        },
      ],
    };

    expect(
      resolveChurchHistoryCopy(
        { ko: { events: [] }, en: copy },
        'ko',
      ),
    ).toEqual(copy);
  });

  it('keeps event order and shares event images across language copies', () => {
    const content = normalizeChurchHistoryContent({
      en: {
        introduction: 'Remove from CMS content',
        events: [
          {
            id: 'second',
            date: '2020.12.13',
            title: 'Legacy event title',
            description: '',
            imageUrl: '',
            imageId: '',
            sourceFileId: '',
          },
          {
            id: 'first',
            date: '2013.05.12',
            description: '',
            imageUrl: '/images/first.png',
            imageId: '',
            sourceFileId: '',
          },
        ],
      },
      ko: {
        events: [
          {
            id: 'second',
            date: '2020.12.13',
            description: '',
          },
        ],
      },
    }, [], {
      events: {
        second: {
          imageId: 'history-image',
          sourceFileId: 'history-file',
        },
      },
    });

    expect(content.ko.events.map((event) => event.id)).toEqual([
      'second',
      'first',
    ]);
    expect(content.ko.events[0]).toMatchObject({
      imageId: 'history-image',
      sourceFileId: 'history-file',
    });
    expect(content.ko.events[0]).not.toHaveProperty('title');
    expect(content.ko.events[1]).toMatchObject({
      date: '',
      imageUrl: '/images/first.png',
    });
    expect(content.en).not.toHaveProperty('introduction');
    expect(resolveChurchHistoryCopy(content, 'ko').events[0]).toMatchObject({
      imageId: 'history-image',
      sourceFileId: 'history-file',
    });
  });

  it('serializes event images once outside language-specific content', () => {
    const serialized = serializeChurchHistoryContent({
      en: {
        events: [
          {
            id: 'later-event',
            date: '2024.01.01',
            description: 'A later event',
            imageUrl: '',
            imageId: 'optimized-image',
            sourceFileId: 'source-file',
          },
        ],
      },
      ko: {
        events: [
          {
            id: 'later-event',
            date: '2024.01.01',
            description: '새 연혁',
            imageUrl: '',
            imageId: 'optimized-image',
            sourceFileId: 'source-file',
          },
        ],
      },
    });

    expect(serialized.content.en.events[0]).toEqual({
      id: 'later-event',
      date: '2024.01.01',
      description: 'A later event',
    });
    expect(serialized.sharedMedia.events).toEqual({
      'later-event': {
        imageId: 'optimized-image',
        sourceFileId: 'source-file',
      },
    });
  });
});
