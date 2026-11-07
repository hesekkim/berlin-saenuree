import { EditorContent } from '@tiptap/react';
import RichTextToolbar from './Toolbar';
import { useRichTextEditor } from './useRichTextEditor';
import type { RichTextEditorProps } from './types';
import styles from './RichTextEditor.module.css';

export default function RichTextEditor({
  value,
  defaultValue,
  onChange,
  placeholder = 'Enter message',
  labels: labelsProp,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: RichTextEditorProps) {
  const {
    editor,
    labels,
    focused,
    ctrlHeld,
    colorMenuOpen,
    sizeMenuOpen,
    moreOpen,
    colorWrapRef,
    sizeWrapRef,
    moreWrapRef,
    currentColor,
    currentFontSize,
    activeMarks,
    activeAlign,
    toggleMark,
    setAlign,
    selectColor,
    applyColor,
    dismissColorMenu,
    selectFontSize,
    toggleColorMenu,
    toggleSizeMenu,
    toggleMore,
  } = useRichTextEditor({
    value,
    defaultValue,
    onChange,
    placeholder,
    labels: labelsProp,
    disabled,
  });

  const rootClass = [
    styles.root,
    focused ? styles.rootFocused : '',
    disabled ? styles.rootDisabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const surfaceClass = [styles.surface, ctrlHeld ? styles.surfaceCtrlHeld : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <RichTextToolbar
        labels={labels}
        disabled={disabled}
        activeMarks={activeMarks}
        activeAlign={activeAlign}
        currentColor={currentColor}
        currentFontSize={currentFontSize}
        colorMenuOpen={colorMenuOpen}
        sizeMenuOpen={sizeMenuOpen}
        moreOpen={moreOpen}
        colorWrapRef={colorWrapRef}
        sizeWrapRef={sizeWrapRef}
        moreWrapRef={moreWrapRef}
        onToggleMark={toggleMark}
        onSetAlign={setAlign}
        onToggleColorMenu={toggleColorMenu}
        onToggleSizeMenu={toggleSizeMenu}
        onToggleMore={toggleMore}
        onSelectColor={selectColor}
        onApplyColor={applyColor}
        onDismissColorMenu={dismissColorMenu}
        onSelectFontSize={selectFontSize}
      />

      <EditorContent
        editor={editor}
        className={surfaceClass}
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}

export type { RichTextEditorProps, RichTextEditorLabels } from './types';
export { DEFAULT_RICH_TEXT_LABELS, DE_RICH_TEXT_LABELS } from './types';
