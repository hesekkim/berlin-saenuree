import { describe, expect, it } from 'vitest';
import { Language } from '../../src/shared/types/Language';
import {
  ensureHomeContentLanguage,
  resolveHomeCopy,
} from '../../src/shared/content/homeContent';

describe('homeContent helpers', () => {
  it('ensures a missing language with empty copy for editing', () => {
    const content = ensureHomeContentLanguage(
      {
        [Language.EN]: {
          title: 'EN',
          subtitle: 's',
          description: 'd',
        },
      },
      'fr'
    );

    expect(content.fr).toEqual({
      title: '',
      subtitle: '',
      description: '',
    });
    expect(content[Language.EN].title).toBe('EN');
  });

  it('resolves blank active language to another language with copy', () => {
    const content = {
      [Language.KO]: {
        title: '',
        subtitle: '',
        description: '',
      },
      [Language.EN]: {
        title: 'English title',
        subtitle: 'sub',
        description: 'desc',
      },
    };

    expect(resolveHomeCopy(content, Language.KO).title).toBe('English title');
    expect(resolveHomeCopy(content, Language.EN).title).toBe('English title');
  });

  it('returns empty copy when every language is blank', () => {
    expect(resolveHomeCopy({}, Language.EN)).toEqual({
      title: '',
      subtitle: '',
      description: '',
    });
  });
});
