import { mergeAttributes } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import type { LinkOptions } from '@tiptap/extension-link';
import { MEDIA_FILE_PATH_PREFIX, isValidLinkUrl } from '../../../lib/richText';

/** Real URL lives here in the editor DOM so <a> is not navigable. */
export const RICH_HREF_ATTR = 'data-rich-href';

/**
 * TipTap Link that does not put a navigable href in the editor.
 * Stored HTML is converted back to normal <a href> via toStoredRichTextHtml.
 */
export const EditorLink = Link.extend({
  name: 'link',

  addOptions(): LinkOptions {
    return {
      ...this.parent?.(),
      openOnClick: false,
      HTMLAttributes: {
        class: 'rich-text-link',
        rel: 'noopener noreferrer nofollow',
      },
    } as LinkOptions;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute(RICH_HREF_ATTR) || element.getAttribute('href'),
        renderHTML: (attributes: { href?: string | null }) => {
          if (!attributes.href) {
            return {};
          }
          return { [RICH_HREF_ATTR]: attributes.href };
        },
      },
      target: {
        default: null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `a[${RICH_HREF_ATTR}]`,
        getAttrs: (dom) => {
          const href = (dom as HTMLElement).getAttribute(RICH_HREF_ATTR);
          if (!href || !isValidLinkUrl(href)) {
            return false;
          }
          return null;
        },
      },
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = (dom as HTMLElement).getAttribute('href');
          if (!href || href === '#' || !isValidLinkUrl(href)) {
            return false;
          }
          return null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const rawHref =
      (HTMLAttributes[RICH_HREF_ATTR] as string | undefined) ||
      (HTMLAttributes.href as string | undefined);
    const rest = { ...HTMLAttributes };
    delete rest.href;
    delete rest.target;
    delete rest[RICH_HREF_ATTR];

    if (!rawHref || !isValidLinkUrl(rawHref)) {
      return ['a', mergeAttributes(this.options.HTMLAttributes, rest), 0];
    }

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, rest, {
        [RICH_HREF_ATTR]: rawHref,
        href: null,
        target: null,
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? [];
    return plugins.filter((plugin) => {
      const key = (plugin as { key?: unknown }).key;
      return !String(key ?? '').startsWith('handleClickLink');
    });
  },
});

/** Convert editor HTML (data-rich-href) to stored HTML with real href. */
export function toStoredRichTextHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(`a[${RICH_HREF_ATTR}]`).forEach((node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    const real = node.getAttribute(RICH_HREF_ATTR);
    if (!real) {
      return;
    }
    node.setAttribute('href', real);
    node.removeAttribute(RICH_HREF_ATTR);
  });
  // Images render through an absolute API origin so the browser can load them;
  // stored HTML keeps the origin-independent path the sanitizers expect.
  doc.querySelectorAll('img[data-media-id]').forEach((node) => {
    const src = node.getAttribute('src');
    if (!src) {
      return;
    }
    try {
      const url = new URL(src, window.location.origin);
      if (url.pathname.startsWith(MEDIA_FILE_PATH_PREFIX)) {
        node.setAttribute('src', `${url.pathname}${url.search}`);
      }
    } catch {
      // Keep malformed media references for the sanitizer to drop.
    }
  });
  return doc.body.innerHTML;
}

export function readAnchorHref(anchor: HTMLAnchorElement): string | null {
  const href =
    anchor.getAttribute(RICH_HREF_ATTR)?.trim() ||
    anchor.getAttribute('href')?.trim();
  if (!href || href === '#') {
    return null;
  }
  return href;
}
