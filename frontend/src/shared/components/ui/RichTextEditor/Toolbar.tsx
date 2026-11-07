import { useRef, type ReactNode, type RefObject } from 'react';
import {
  MdFormatAlignCenter,
  MdFormatAlignLeft,
  MdFormatAlignRight,
  MdFormatBold,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatSize,
  MdFormatStrikethrough,
  MdFormatUnderlined,
  MdAttachFile,
  MdImage,
  MdLink,
  MdMoreHoriz,
} from 'react-icons/md';
import ColorMenu from './ColorMenu';
import FontSizeMenu from './FontSizeMenu';
import ToolbarButton, { OverflowItem, ToolbarDivider } from './ToolbarButton';
import {
  TOOL_ORDER,
  isDivider,
  type MarkCommandId,
  type TextAlignValue,
  type ToolId,
} from './toolbarConfig';
import { useToolbarOverflow } from './useToolbarOverflow';
import type { RichTextEditorLabels } from './types';
import styles from './RichTextEditor.module.css';

type MarkToolDef = {
  id: MarkCommandId;
  labelKey: keyof RichTextEditorLabels;
  shortcut?: string;
  Icon: typeof MdFormatBold;
};

const MARK_TOOLS: MarkToolDef[] = [
  {
    id: 'bold',
    labelKey: 'bold',
    shortcut: 'Ctrl+B',
    Icon: MdFormatBold,
  },
  {
    id: 'italic',
    labelKey: 'italic',
    shortcut: 'Ctrl+I',
    Icon: MdFormatItalic,
  },
  {
    id: 'underline',
    labelKey: 'underline',
    shortcut: 'Ctrl+U',
    Icon: MdFormatUnderlined,
  },
  {
    id: 'strike',
    labelKey: 'strike',
    shortcut: 'Ctrl+Shift+S',
    Icon: MdFormatStrikethrough,
  },
  {
    id: 'bulletList',
    labelKey: 'bulletList',
    shortcut: 'Ctrl+Shift+8',
    Icon: MdFormatListBulleted,
  },
  {
    id: 'orderedList',
    labelKey: 'orderedList',
    shortcut: 'Ctrl+Shift+7',
    Icon: MdFormatListNumbered,
  },
];

const ALIGN_TOOLS: {
  id: ToolId;
  align: TextAlignValue;
  labelKey: 'alignLeft' | 'alignCenter' | 'alignRight';
  Icon: typeof MdFormatAlignLeft;
}[] = [
  {
    id: 'alignLeft',
    align: 'left',
    labelKey: 'alignLeft',
    Icon: MdFormatAlignLeft,
  },
  {
    id: 'alignCenter',
    align: 'center',
    labelKey: 'alignCenter',
    Icon: MdFormatAlignCenter,
  },
  {
    id: 'alignRight',
    align: 'right',
    labelKey: 'alignRight',
    Icon: MdFormatAlignRight,
  },
];

export type RichTextToolbarProps = {
  labels: RichTextEditorLabels;
  disabled: boolean;
  activeMarks: Record<MarkCommandId, boolean>;
  activeAlign: TextAlignValue | null;
  isLinkActive?: boolean;
  canAddLink?: boolean;
  canEditLink?: boolean;
  currentColor: string;
  currentFontSize: string;
  colorMenuOpen: boolean;
  sizeMenuOpen: boolean;
  moreOpen: boolean;
  colorWrapRef: RefObject<HTMLDivElement | null>;
  sizeWrapRef: RefObject<HTMLDivElement | null>;
  moreWrapRef: RefObject<HTMLDivElement | null>;
  onToggleMark: (id: MarkCommandId, fromOverflow?: boolean) => void;
  onSetAlign: (align: TextAlignValue, fromOverflow?: boolean) => void;
  onToggleColorMenu: (fromOverflow?: boolean) => void;
  onToggleSizeMenu: (fromOverflow?: boolean) => void;
  onToggleMore: () => void;
  onSelectColor: (color: string) => void;
  onApplyColor: (color: string) => void;
  onDismissColorMenu: () => void;
  onSelectFontSize: (size: string | null) => void;
  onLinkClick?: () => void;
  includeLink?: boolean;
  includeUpload?: boolean;
  onInsertImage?: () => void;
  onInsertAttachment?: () => void;
};

function ColorGlyph({ color }: { color: string }) {
  return (
    <span className={styles.colorGlyph} aria-hidden="true">
      <span>A</span>
      <span className={styles.colorBar} style={{ backgroundColor: color }} />
    </span>
  );
}

function DualTool({
  inOverflow,
  forMeasure,
  label,
  shortcut,
  title,
  active,
  disabled,
  onClick,
  icon,
}: {
  inOverflow: boolean;
  forMeasure: boolean;
  label: string;
  shortcut?: string;
  title?: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  if (inOverflow) {
    return (
      <OverflowItem
        label={label}
        title={title}
        active={active}
        disabled={disabled}
        onClick={onClick}
      >
        {icon}
      </OverflowItem>
    );
  }
  if (forMeasure) {
    return (
      <ToolbarButton
        label={label}
        shortcut={shortcut}
        active={false}
        disabled
        onClick={() => {}}
      >
        {icon}
      </ToolbarButton>
    );
  }
  return (
    <ToolbarButton
      label={title ?? label}
      shortcut={shortcut}
      active={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </ToolbarButton>
  );
}

export default function RichTextToolbar({
  labels,
  disabled,
  activeMarks,
  activeAlign,
  isLinkActive,
  canAddLink,
  canEditLink,
  currentColor,
  currentFontSize,
  colorMenuOpen,
  sizeMenuOpen,
  moreOpen,
  colorWrapRef,
  sizeWrapRef,
  moreWrapRef,
  onToggleMark,
  onSetAlign,
  onToggleColorMenu,
  onToggleSizeMenu,
  onToggleMore,
  onSelectColor,
  onApplyColor,
  onDismissColorMenu,
  onSelectFontSize,
  onLinkClick,
  includeLink = false,
  includeUpload = false,
  onInsertImage,
  onInsertAttachment,
}: RichTextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const toolOrder = [
    ...(includeLink ? [...TOOL_ORDER, 'link' as const] : TOOL_ORDER),
    ...(includeUpload ? (['image', 'attachment'] as const) : []),
  ];
  const visibleCount = useToolbarOverflow(
    toolbarRef,
    measureRef,
    toolOrder.length,
  );

  let visibleIds = toolOrder.slice(0, visibleCount);
  while (
    visibleIds.length > 0 &&
    isDivider(visibleIds[visibleIds.length - 1])
  ) {
    visibleIds = visibleIds.slice(0, -1);
  }
  const overflowIds = toolOrder
    .slice(visibleCount)
    .filter((id) => !isDivider(id));
  const showMore = overflowIds.length > 0;

  const renderTool = (
    id: ToolId,
    options?: { inOverflow?: boolean; forMeasure?: boolean },
  ) => {
    const inOverflow = options?.inOverflow === true;
    const forMeasure = options?.forMeasure === true;

    if (isDivider(id)) {
      return <ToolbarDivider key={id} />;
    }

    const markDef = MARK_TOOLS.find((tool) => tool.id === id);
    if (markDef) {
      const { Icon } = markDef;
      return (
        <DualTool
          key={id}
          inOverflow={inOverflow}
          forMeasure={forMeasure}
          label={labels[markDef.labelKey]}
          shortcut={markDef.shortcut}
          active={activeMarks[markDef.id]}
          disabled={disabled}
          onClick={() => onToggleMark(markDef.id, inOverflow)}
          icon={<Icon aria-hidden="true" />}
        />
      );
    }

    if (id === 'textColor') {
      const trigger = inOverflow ? (
        <OverflowItem
          label={labels.textColor}
          active={colorMenuOpen}
          disabled={disabled}
          onClick={() => onToggleColorMenu(true)}
        >
          <ColorGlyph color={currentColor} />
        </OverflowItem>
      ) : (
        <ToolbarButton
          label={labels.textColor}
          active={!forMeasure && colorMenuOpen}
          disabled={disabled || forMeasure}
          onClick={() => onToggleColorMenu(false)}
        >
          <ColorGlyph color={currentColor} />
        </ToolbarButton>
      );
      return (
        <div
          key={id}
          className={styles.menuWrap}
          ref={forMeasure ? undefined : colorWrapRef}
        >
          {trigger}
          {!forMeasure && colorMenuOpen ? (
            <ColorMenu
              label={labels.textColor}
              currentColor={currentColor}
              alignEnd={inOverflow}
              onSelect={onSelectColor}
              onApply={onApplyColor}
              onDismiss={onDismissColorMenu}
            />
          ) : null}
        </div>
      );
    }

    if (id === 'fontSize') {
      const trigger = inOverflow ? (
        <OverflowItem
          label={labels.fontSize}
          active={sizeMenuOpen}
          disabled={disabled}
          onClick={() => onToggleSizeMenu(true)}
        >
          <MdFormatSize aria-hidden="true" />
        </OverflowItem>
      ) : (
        <ToolbarButton
          label={labels.fontSize}
          active={!forMeasure && sizeMenuOpen}
          disabled={disabled || forMeasure}
          onClick={() => onToggleSizeMenu(false)}
        >
          <MdFormatSize aria-hidden="true" />
        </ToolbarButton>
      );
      return (
        <div
          key={id}
          className={styles.menuWrap}
          ref={forMeasure ? undefined : sizeWrapRef}
        >
          {trigger}
          {!forMeasure && sizeMenuOpen ? (
            <FontSizeMenu
              label={labels.fontSize}
              defaultLabel={labels.fontSizeDefault}
              currentFontSize={currentFontSize}
              alignEnd={inOverflow}
              onSelectDefault={() => onSelectFontSize(null)}
              onSelect={(size) => onSelectFontSize(size)}
            />
          ) : null}
        </div>
      );
    }

    const alignDef = ALIGN_TOOLS.find((tool) => tool.id === id);
    if (alignDef) {
      const { Icon } = alignDef;
      return (
        <DualTool
          key={id}
          inOverflow={inOverflow}
          forMeasure={forMeasure}
          label={labels[alignDef.labelKey]}
          active={activeAlign === alignDef.align}
          disabled={disabled}
          onClick={() => onSetAlign(alignDef.align, inOverflow)}
          icon={<Icon aria-hidden="true" />}
        />
      );
    }

    if (id === 'link') {
      const linkDisabled = disabled || (!canAddLink && !canEditLink);
      const linkTitle = canEditLink
        ? labels.linkEdit
        : canAddLink
          ? `${labels.link} (Ctrl+K)`
          : labels.linkNeedsSelection;
      return (
        <DualTool
          key={id}
          inOverflow={inOverflow}
          forMeasure={forMeasure}
          label={canEditLink ? labels.linkEdit : labels.link}
          title={linkTitle}
          shortcut={canAddLink ? 'Ctrl+K' : undefined}
          active={Boolean(isLinkActive)}
          disabled={linkDisabled || forMeasure}
          onClick={() => onLinkClick?.()}
          icon={<MdLink aria-hidden="true" />}
        />
      );
    }

    if (id === 'image' || id === 'attachment') {
      const isImage = id === 'image';
      return (
        <DualTool
          key={id}
          inOverflow={inOverflow}
          forMeasure={forMeasure}
          label={isImage ? labels.insertImage : labels.attachFile}
          active={false}
          disabled={disabled || forMeasure}
          onClick={
            isImage ? () => onInsertImage?.() : () => onInsertAttachment?.()
          }
          icon={
            isImage ? (
              <MdImage aria-hidden="true" />
            ) : (
              <MdAttachFile aria-hidden="true" />
            )
          }
        />
      );
    }

    return null;
  };

  return (
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      role="toolbar"
      aria-label={labels.toolbar}
    >
      <div ref={measureRef} className={styles.measure} aria-hidden="true">
        {toolOrder.map((id) => (
          <span key={id} data-toolbar-item>
            {renderTool(id, { forMeasure: true })}
          </span>
        ))}
        <span data-toolbar-more>
          <ToolbarButton label={labels.more} onClick={() => {}} disabled>
            <MdMoreHoriz aria-hidden="true" />
          </ToolbarButton>
        </span>
      </div>

      <div className={styles.toolbarVisible}>
        {visibleIds.map((id) => renderTool(id))}
      </div>

      {showMore ? (
        <div className={styles.toolbarMoreSlot} ref={moreWrapRef}>
          <ToolbarButton
            label={labels.more}
            active={moreOpen}
            disabled={disabled}
            onClick={onToggleMore}
          >
            <MdMoreHoriz aria-hidden="true" />
          </ToolbarButton>
          {moreOpen ? (
            <div
              className={[styles.menu, styles.menuAlignEnd, styles.overflowMenu]
                .filter(Boolean)
                .join(' ')}
              role="menu"
              aria-label={labels.more}
            >
              {overflowIds.map((id) => renderTool(id, { inOverflow: true }))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
