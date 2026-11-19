import type { AdminTranslations } from '../../translations';

export type MemberFormValues = {
  name: string;
  birthDate: string;
  email: string;
  phone: string;
};

export type MemberFormErrors = Partial<
  Record<keyof MemberFormValues, string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9(). -]+$/;

export function validateMemberForm(
  values: MemberFormValues,
  labels: AdminTranslations,
): MemberFormErrors {
  const errors: MemberFormErrors = {};
  const email = values.email.trim();
  const phone = values.phone.trim();

  if (!values.name.trim()) {
    errors.name = labels.membersNameRequired;
  }
  if (!values.birthDate) {
    errors.birthDate = labels.membersBirthDateRequired;
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = labels.membersEmailInvalid;
  }
  if (phone) {
    const digitCount = [...phone].filter((character) =>
      /[0-9]/.test(character),
    ).length;
    if (!PHONE_PATTERN.test(phone) || digitCount < 5 || digitCount > 15) {
      errors.phone = labels.membersPhoneInvalid;
    }
  }
  return errors;
}
