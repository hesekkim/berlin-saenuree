import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createMediaKeyboardShortcuts } from './mediaKeyboard';
import {
  mediaFileUrl,
  normalizeMediaContentType,
  normalizeMediaName,
  normalizeMediaSizeBytes,
  normalizeMediaWidth,
} from '../../../lib/richText';
import MediaAttachmentNodeView from './MediaAttachmentNodeView';
import MediaImageNodeView from './MediaImageNodeView';

export const DEFAULT_ATTACHMENT_CONTENT_TYPE = 'application/octet-stream';

const mediaIdAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute('data-media-id'),
};

const imageIdAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute('data-image-id'),
};

export const MediaImage = Node.create({
  name: 'mediaImage',
  // Ahead of StarterKit so the media arrow/delete handling wins over the
  // generic bindings (list lift on Backspace, browser caret motion).
  priority: 1000,
  group: 'inline',
  inline: true,
  atom: true,
  // Click-to-select stays: `046` hangs the resize handle off the selection.
  selectable: true,

  addKeyboardShortcuts() {
    return createMediaKeyboardShortcuts(this.name);
  },

  addAttributes() {
    return {
      mediaId: mediaIdAttribute,
      imageId: imageIdAttribute,
      alt: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          normalizeMediaName(element.getAttribute('alt')),
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeMediaWidth(element.getAttribute('data-media-width')),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-media-id]' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaImageNodeView);
  },

  renderHTML({ HTMLAttributes }) {
    const mediaId = String(HTMLAttributes.mediaId ?? '');
    const imageId = String(HTMLAttributes.imageId ?? '');
    const width = normalizeMediaWidth(HTMLAttributes.width);
    const attrs: Record<string, string | number> = {
      'data-media-id': mediaId,
      src: imageId
        ? `/api/v1/media/images/${imageId}/display`
        : mediaFileUrl(mediaId),
      alt: HTMLAttributes.alt || '',
      class: 'rich-text-media-image',
    };
    if (imageId) {
      attrs['data-image-id'] = imageId;
    }
    if (width !== null) {
      attrs['data-media-width'] = String(width);
      attrs.width = width;
    }
    return ['img', attrs];
  },
});

export const MediaAttachment = Node.create({
  name: 'mediaAttachment',
  // Ahead of StarterKit, and ahead of Link so `a[data-media-kind]` is parsed
  // as an attachment node rather than a link mark.
  priority: 1000,
  group: 'inline',
  inline: true,
  atom: true,
  // The card carries its own Remove button, so there is nothing a
  // NodeSelection would add beyond a state where typing deletes the file.
  selectable: false,

  addAttributes() {
    return {
      mediaId: mediaIdAttribute,
      name: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          normalizeMediaName(
            element.getAttribute('data-media-name') || element.textContent,
          ),
      },
      contentType: {
        default: DEFAULT_ATTACHMENT_CONTENT_TYPE,
        parseHTML: (element: HTMLElement) =>
          normalizeMediaContentType(
            element.getAttribute('data-media-content-type'),
          ) ?? DEFAULT_ATTACHMENT_CONTENT_TYPE,
      },
      sizeBytes: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeMediaSizeBytes(element.getAttribute('data-media-size')),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-media-kind="attachment"]' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaAttachmentNodeView);
  },

  addKeyboardShortcuts() {
    return createMediaKeyboardShortcuts(this.name);
  },

  renderHTML({ HTMLAttributes }) {
    const mediaId = String(HTMLAttributes.mediaId ?? '');
    const name = String(HTMLAttributes.name ?? '');
    const sizeBytes = normalizeMediaSizeBytes(HTMLAttributes.sizeBytes);
    const attrs: Record<string, string> = {
      'data-media-id': mediaId,
      'data-media-kind': 'attachment',
      'data-media-name': name,
      'data-media-content-type':
        normalizeMediaContentType(HTMLAttributes.contentType) ??
        DEFAULT_ATTACHMENT_CONTENT_TYPE,
      href: mediaFileUrl(mediaId, { download: true }),
    };
    if (sizeBytes !== null) {
      attrs['data-media-size'] = String(sizeBytes);
    }
    return ['a', attrs, name];
  },
});
