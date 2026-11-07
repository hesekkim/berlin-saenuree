import { test as base, expect, type Page } from '@playwright/test';

const consent = {
  necessary: true,
  functional: true,
  version: '1.0',
  timestamp: '2026-01-01T00:00:00.000Z',
};

async function configurePage(
  { page }: { page: Page },
  fixtureCallback: (page: Page) => Promise<void>,
) {
  await page.addInitScript((value) => {
    localStorage.setItem('cookie_consent', JSON.stringify(value));
    localStorage.setItem('language', 'en');
  }, consent);
  await fixtureCallback(page);
}

export const test = base.extend({
  page: configurePage,
});

export { expect };
