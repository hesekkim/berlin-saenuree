import { useMemo, type Ref } from 'react';
import { mediaFileAbsoluteUrl } from '../../../api/mediaApi';
import { sanitizeRichHtml } from '../../../lib/richText';
import styles from './SanitizedRichText.module.css';

type SanitizedRichTextProps = {
  html: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  'aria-label'?: string;
};

export default function SanitizedRichText({
  html,
  className = '',
  ref,
  'aria-label': ariaLabel,
}: SanitizedRichTextProps) {
  const safeHtml = useMemo(() => sanitizeRichHtml(html), [html]);
  const renderedHtml = useMemo(() => {
    if (!safeHtml || typeof DOMParser === 'undefined') {
      return safeHtml;
    }

    const doc = new DOMParser().parseFromString(safeHtml, 'text/html');
    for (const image of doc.querySelectorAll<HTMLImageElement>('img[src]')) {
      image.src = mediaFileAbsoluteUrl(image.getAttribute('src') ?? '');
    }
    for (const attachment of doc.querySelectorAll<HTMLAnchorElement>(
      'a[data-media-kind="attachment"][href]',
    )) {
      attachment.href = mediaFileAbsoluteUrl(
        attachment.getAttribute('href') ?? '',
      );
    }
    return doc.body.innerHTML;
  }, [safeHtml]);

  return (
    <div
      ref={ref}
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
