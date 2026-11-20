import { describe, expect, it } from 'vitest';
import type { ChurchMember } from '../../src/shared/api/churchMembersApi';
import {
  filterChurchMembers,
  type MemberFilters,
} from '../../src/pages/Admin/Pages/Members/memberFilters';

const noFilters: MemberFilters = {
  birthMonth: '',
  searchTerm: '',
};

function makeMember(
  id: string,
  name: string,
  birthDate: string,
  email: string | null = null,
  phone: string | null = null,
): ChurchMember {
  return { id, name, birthDate, email, phone };
}

describe('filterChurchMembers', () => {
  it('filters birthdays by month regardless of birth year and sorts by day', () => {
    const members = [
      makeMember('august', 'Alex', '1980-08-31'),
      makeMember('late-september', 'Jamie', '1975-09-24'),
      makeMember('early-september', 'Sam', '2000-09-03'),
    ];

    expect(
      filterChurchMembers(
        members,
        { ...noFilters, birthMonth: '09' },
        'en',
      ).map((member) => member.id),
    ).toEqual(['early-september', 'late-september']);
  });

  it('combines case-insensitive name search with the birthday month filter', () => {
    const members = [
      makeMember('match', 'Kim Hana', '1980-09-10'),
      makeMember('other-month', 'Kim Hana', '1981-08-10'),
      makeMember('other-name', 'Park Bora', '1982-09-10'),
    ];

    expect(
      filterChurchMembers(
        members,
        {
          ...noFilters,
          searchTerm: 'hana',
          birthMonth: '09',
        },
        'en',
      ).map((member) => member.id),
    ).toEqual(['match']);
  });

  it('keeps name sorting when no birthday month is selected', () => {
    const members = [
      makeMember('z', 'Zoe', '1980-01-01'),
      makeMember('a', 'Alex', '1980-01-02'),
    ];

    expect(
      filterChurchMembers(members, noFilters, 'en').map((member) => member.id),
    ).toEqual(['a', 'z']);
  });
});
