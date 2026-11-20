import type { ChurchMember } from '../../../../shared/api/churchMembersApi';

export interface MemberFilters {
  birthMonth: string;
  searchTerm: string;
}

export function filterChurchMembers(
  members: ChurchMember[],
  filters: MemberFilters,
  language: string,
): ChurchMember[] {
  const normalizedSearch = filters.searchTerm.trim().toLocaleLowerCase(language);
  const filtered = members.filter((member) => {
    const birthMonth = member.birthDate.slice(5, 7);
    const matchesBirthMonth =
      !filters.birthMonth || birthMonth === filters.birthMonth;
    const matchesName =
      !normalizedSearch ||
      member.name.toLocaleLowerCase(language).includes(normalizedSearch);

    return (
      matchesBirthMonth &&
      matchesName
    );
  });

  return filtered.sort((left, right) => {
    if (filters.birthMonth) {
      const birthdayOrder = left.birthDate
        .slice(8, 10)
        .localeCompare(right.birthDate.slice(8, 10));
      if (birthdayOrder !== 0) {
        return birthdayOrder;
      }
    }

    return (
      left.name.localeCompare(right.name, language) ||
      left.id.localeCompare(right.id)
    );
  });
}
