import { createContext, useContext } from 'react';
import {
  DEFAULT_RICH_TEXT_LABELS,
  type RichTextEditorLabels,
} from '../RichTextEditor/types';

type RichTextEditorExContextValue = {
  labels: RichTextEditorLabels;
};

/**
 * TipTap renders React node views as portals inside `EditorContent`, so a
 * provider above it reaches them and keeps labels reactive on locale change.
 */
export const RichTextEditorExContext =
  createContext<RichTextEditorExContextValue>({
    labels: DEFAULT_RICH_TEXT_LABELS,
  });

export function useRichTextEditorExContext(): RichTextEditorExContextValue {
  return useContext(RichTextEditorExContext);
}
