import { expect, test } from './fixtures';

test('home page loads', async ({ page }) => {
  await page.goto('/home');

  await expect(page.getByRole('main')).toBeVisible();
});

test('root redirects to home', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('main')).toBeVisible();
});

test('admin page shows login modal', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter your admin email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send Code' })).toBeVisible();
});
