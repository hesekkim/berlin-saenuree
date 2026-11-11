import { describe, expect, it } from 'vitest';
import {
  addChurchVisionGoal,
  hasCompleteChurchVisionContent,
  normalizeChurchVisionCopy,
  normalizeChurchVisionContent,
  removeChurchVisionGoal,
  resolveChurchVisionCopy,
} from '../../src/shared/content/churchVisionContent';

describe('Church Vision content', () => {
  it('preserves any number and order of vision items when normalizing', () => {
    const copy = normalizeChurchVisionCopy({
      heading: 'Our vision',
      goals: [
        { id: 'youth', title: 'Youth' },
        { id: 'worship', title: 'Worship' },
        { id: 'extra', title: 'Extra' },
      ],
    });

    expect(copy.goals.map((goal) => goal.id)).toEqual([
      'youth',
      'worship',
      'extra',
    ]);
    expect(copy.goals[0].title).toBe('Youth');
    expect(copy.goals[2].title).toBe('Extra');
  });

  it('adds and removes a vision item consistently across languages', () => {
    const content = normalizeChurchVisionContent(
      { en: { goals: [{ id: 'first', title: 'First' }] } },
      ['en', 'ko'],
    );
    const added = addChurchVisionGoal(content, ['en', 'ko'], 'second');
    const removed = removeChurchVisionGoal(added, 'first');

    expect(added.en.goals.map((goal) => goal.id)).toEqual(['first', 'second']);
    expect(added.ko.goals.map((goal) => goal.id)).toEqual(['first', 'second']);
    expect(removed.en.goals.map((goal) => goal.id)).toEqual(['second']);
    expect(removed.ko.goals.map((goal) => goal.id)).toEqual(['second']);
  });

  it('requires each vision item to be translated in every enabled language', () => {
    const content = normalizeChurchVisionContent(
      {
        en: {
          goals: [
            {
              id: 'first',
              title: 'First',
              quotation: 'A verse',
              reference: 'Psalm 1:1',
            },
          ],
        },
        ko: {},
      },
      ['en', 'ko'],
    );

    expect(hasCompleteChurchVisionContent(content, ['en', 'ko'])).toBe(false);
    content.ko.goals[0] = {
      id: 'first',
      title: '첫째',
      quotation: '성경 구절',
      reference: '시편 1편 1절',
    };
    expect(hasCompleteChurchVisionContent(content, ['en', 'ko'])).toBe(true);
  });

  it('falls back to English when the selected language has no content', () => {
    const copy = resolveChurchVisionCopy(
      {
        en: {
          heading: 'Our vision',
          goals: [{ id: 'worship', title: 'Restore worship' }],
        },
        ko: {},
      },
      'ko',
    );

    expect(copy.heading).toBe('Our vision');
    expect(copy.goals[0].title).toBe('Restore worship');
  });

  it('prefers content in the selected language', () => {
    const copy = resolveChurchVisionCopy(
      {
        en: { heading: 'Our vision' },
        ko: { heading: '교회 비전' },
      },
      'ko',
    );

    expect(copy.heading).toBe('교회 비전');
  });
});
