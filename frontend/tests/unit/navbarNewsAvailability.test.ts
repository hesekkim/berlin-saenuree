import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { filterNavbarItems } from '../../src/shared/components/Navbar/useNavbarChrome';
import NavbarItem from '../../src/shared/components/NavbarItem/NavbarItem';
import navbarItems from '../../src/shared/config/navbar-items';

describe('Saenuree News navigation availability', () => {
  it('keeps Photo News visible and hides Church Stories when there are no published stories', () => {
    const newsItem = filterNavbarItems(navbarItems, false, false).find(
      (item) => item.link === '/saenuree-news/posts',
    );

    expect(newsItem?.subNavbarItems?.map((item) => item.link)).toEqual([
      '/saenuree-news/posts',
    ]);
  });

  it('shows Church Stories when published stories exist', () => {
    const newsItem = filterNavbarItems(navbarItems, false, true).find(
      (item) => item.link === '/saenuree-news/posts',
    );

    expect(newsItem?.subNavbarItems?.map((item) => item.link)).toEqual([
      '/saenuree-news/posts',
      '/saenuree-news/blogger',
    ]);
  });

  it('marks Church Stories selected on a story detail route', () => {
    const newsItem = filterNavbarItems(navbarItems, false, true).find(
      (item) => item.link === '/saenuree-news/posts',
    );
    expect(newsItem).toBeDefined();
    if (!newsItem) {
      return;
    }

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/saenuree-news/blogger/story-1'] },
        createElement(NavbarItem, {
          navbarItem: newsItem,
          onClick: () => {},
          openMenuBar: true,
        }),
      ),
    );

    expect(
      screen.getByRole('link', { name: 'Church Stories' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
