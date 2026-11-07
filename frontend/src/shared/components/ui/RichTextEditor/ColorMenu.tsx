import { COLOR_PRESETS } from './toolbarConfig';
import styles from './RichTextEditor.module.css';

export type ColorMenuProps = {
  label: string;
  currentColor: string;
  alignEnd?: boolean;
  /** Preset swatch — apply and close the menu. */
  onSelect: (color: string) => void;
  /**
   * Native color picker — apply while dragging without closing.
   * Closing unmounts the input and dismisses the OS/browser palette.
   */
  onApply: (color: string) => void;
  /** Called when the native picker closes (input blur). */
  onDismiss: () => void;
};

export default function ColorMenu({
  label,
  currentColor,
  alignEnd = false,
  onSelect,
  onApply,
  onDismiss,
}: ColorMenuProps) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(currentColor)
    ? currentColor
    : '#424242';

  return (
    <div
      className={[
        styles.menu,
        styles.colorMenu,
        alignEnd ? styles.menuAlignEnd : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="menu"
      aria-label={label}
    >
      <div className={styles.swatches}>
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={styles.swatch}
            style={{ backgroundColor: color }}
            aria-label={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
      <label className={styles.customColor}>
        <span>{label}</span>
        <input
          type="color"
          value={safeColor}
          onChange={(event) => onApply(event.target.value)}
          onBlur={() => onDismiss()}
        />
      </label>
    </div>
  );
}
