import { describe, expect, it } from 'vitest';
import { validateMemberForm } from '../../src/pages/Admin/Pages/Members/memberValidation';
import { adminTranslations } from '../../src/pages/Admin/translations';
import { Language } from '../../src/shared/context/ConfigContext';

const labels = adminTranslations[Language.EN];

describe('validateMemberForm', () => {
  it('accepts empty optional contact fields', () => {
    expect(
      validateMemberForm(
        { name: 'Member', birthDate: '1990-04-12', email: '', phone: '' },
        labels,
      ),
    ).toEqual({});
  });

  it('returns field-specific errors for invalid email and phone formats', () => {
    expect(
      validateMemberForm(
        {
          name: 'Member',
          birthDate: '1990-04-12',
          email: 'not-an-email',
          phone: 'Call me',
        },
        labels,
      ),
    ).toEqual({
      email: labels.membersEmailInvalid,
      phone: labels.membersPhoneInvalid,
    });
  });
});
