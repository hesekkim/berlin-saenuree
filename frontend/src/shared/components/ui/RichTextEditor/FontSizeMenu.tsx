import { FONT_SIZE_OPTIONS } from './types';
import styles from './RichTextEditor.module.css';

export type FontSizeMenuProps = {
  label: string;
  defaultLabel: string;
  currentFontSize: string;
  alignEnd?: boolean;
  onSelectDefault: () => void;
  onSelect: (size: string) => void;
};

export default function FontSizeMenu({
  label,
  defaultLabel,
  currentFontSize,
  alignEnd = false,
  onSelectDefault,
  onSelect,
}: FontSizeMenuProps) {
  return (
    <div
      className={[styles.menu, alignEnd ? styles.menuAlignEnd : '']
        .filter(Boolean)
        .join(' ')}
      role="menu"
      aria-label={label}
    >
      <button
        type="button"
        className={styles.sizeOption}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSelectDefault}
      >
        {defaultLabel}
      </button>
      {FONT_SIZE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[
            styles.sizeOption,
            currentFontSize === option.value ? styles.sizeOptionActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
