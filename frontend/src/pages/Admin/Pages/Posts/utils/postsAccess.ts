import type { CmsRole } from '../../../../../shared/api/authApi';
import type { PostResponse } from '../../../../../shared/api/postsApi';

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Anyone with posts page access can create (server enforces assignment). */
export function canCreatePost(role: CmsRole | null): boolean {
  return (
    role === 'site_admin' || role === 'page_admin' || role === 'page_manager'
  );
}

/** Mirrors backend `can_mutate_post` — UI only; server enforces. */
export function canMutatePost(
  role: CmsRole | null,
  email: string | null,
  post: Pick<PostResponse, 'createdBy'>,
): boolean {
  if (role === 'site_admin' || role === 'page_admin') {
    return true;
  }
  const normalizedEmail = normalizeEmail(email);
  if (role !== 'page_manager' || !normalizedEmail) {
    return false;
  }
  return normalizeEmail(post.createdBy) === normalizedEmail;
}

/** Mirrors backend `can_pin_post`. */
export function canPinPost(role: CmsRole | null): boolean {
  return role === 'site_admin' || role === 'page_admin';
}
