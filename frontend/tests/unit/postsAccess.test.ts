import { describe, expect, it } from 'vitest';
import {
  canCreatePost,
  canMutatePost,
  canPinPost,
} from '../../src/pages/Admin/Pages/Posts/utils/postsAccess';

describe('postsAccess', () => {
  it('allows create for CMS roles with posts access', () => {
    expect(canCreatePost('site_admin')).toBe(true);
    expect(canCreatePost('page_admin')).toBe(true);
    expect(canCreatePost('page_manager')).toBe(true);
    expect(canCreatePost(null)).toBe(false);
  });

  it('allows site_admin and page_admin to mutate any post', () => {
    const post = { createdBy: 'author@example.com' };
    expect(canMutatePost('site_admin', 'admin@example.com', post)).toBe(true);
    expect(canMutatePost('page_admin', 'page@example.com', post)).toBe(true);
  });

  it('allows page_manager to mutate only own posts', () => {
    const post = { createdBy: 'manager@example.com' };
    expect(canMutatePost('page_manager', 'manager@example.com', post)).toBe(
      true,
    );
    expect(canMutatePost('page_manager', 'Manager@Example.com', post)).toBe(
      true,
    );
    expect(
      canMutatePost('page_manager', 'manager@example.com', {
        createdBy: 'Manager@Example.com',
      }),
    ).toBe(true);
    expect(canMutatePost('page_manager', 'other@example.com', post)).toBe(
      false,
    );
    expect(canMutatePost('page_manager', null, post)).toBe(false);
  });

  it('allows pin only for site_admin and page_admin', () => {
    expect(canPinPost('site_admin')).toBe(true);
    expect(canPinPost('page_admin')).toBe(true);
    expect(canPinPost('page_manager')).toBe(false);
    expect(canPinPost(null)).toBe(false);
  });
});
