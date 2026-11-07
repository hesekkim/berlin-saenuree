import { Extension, type AnyExtension } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorLink, toStoredRichTextHtml } from './editorLink';
import { FontSize } from './fontSizeExtension';
import { createLinkInteractionExtension } from './linkInteractionExtension';
import type { LinkInteractionHandlers } from './linkInteractionExtension';
import { NativeTextSelection } from './nativeTextSelectionExtension';
import { isValidLinkUrl, normalizeLinkUrl } from '../../../lib/richText';
import type { MarkCommandId, TextAlignValue } from './toolbarConfig';
import {
  DEFAULT_RICH_TEXT_LABELS,
  type LinkContextMenuState,
  type LinkDialogMode,
  type RichTextEditorLabels,
  type RichTextEditorProps,
} from './types';

export function hasNonEmptyTextSelection(editor: Editor | null): boolean {
  if (!editor) {
    return false;
  }
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    return false;
  }
  return editor.state.doc.textBetween(from, to, '\n').trim().length > 0;
}

export function canAddLink(editor: Editor | null): boolean {
  return hasNonEmptyTextSelection(editor) && !editor?.isActive('link');
}

export function canEditLink(editor: Editor | null): boolean {
  return Boolean(editor?.isActive('link'));
}

export function useRichTextEditor({
  value,
  defaultValue = '',
  onChange,
  placeholder = '',
  labels: labelsProp,
  disabled = false,
  enableLinks = false,
  extraExtensions = [],
}: Pick<
  RichTextEditorProps,
  'value' | 'defaultValue' | 'onChange' | 'placeholder' | 'labels' | 'disabled'
> & {
  enableLinks?: boolean;
  extraExtensions?: AnyExtension[];
}) {
  const labels: RichTextEditorLabels = useMemo(
    () => ({ ...DEFAULT_RICH_TEXT_LABELS, ...labelsProp }),
    [labelsProp],
  );

  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkDialogMode>('add');
  const [linkUrl, setLinkUrlState] = useState('https://');
  const [linkError, setLinkError] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [linkContextMenu, setLinkContextMenu] =
    useState<LinkContextMenuState | null>(null);
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const linkContextMenuRef = useRef<HTMLDivElement | null>(null);
  const colorWrapRef = useRef<HTMLDivElement | null>(null);
  const sizeWrapRef = useRef<HTMLDivElement | null>(null);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  const linkHandlersRef = useRef<LinkInteractionHandlers>({
    onContextMenu: () => {},
    onCtrlOpen: () => {},
  });

  const closeLinkContextMenu = () => setLinkContextMenu(null);

  const closeMenus = () => {
    setColorMenuOpen(false);
    setSizeMenuOpen(false);
    setMoreOpen(false);
  };

  const setLinkUrl = (next: string) => {
    setLinkError(false);
    setLinkUrlState(next);
  };

  const closeLinkDialog = () => {
    setLinkOpen(false);
    setLinkError(false);
  };

  const openAddLinkDialog = (): boolean => {
    const current = editorRef.current;
    if (!canAddLink(current)) {
      return false;
    }
    closeMenus();
    closeLinkContextMenu();
    setLinkMode('add');
    setLinkUrlState('https://');
    setLinkError(false);
    setLinkOpen(true);
    return true;
  };

  const openEditLinkDialog = (href?: string) => {
    const current = editorRef.current;
    if (!current) {
      return;
    }
    closeMenus();
    closeLinkContextMenu();
    current.chain().focus().extendMarkRange('link').run();
    const existing =
      href ||
      (current.getAttributes('link').href as string | undefined) ||
      'https://';
    setLinkMode('edit');
    setLinkUrlState(existing);
    setLinkError(false);
    setLinkOpen(true);
  };

  linkHandlersRef.current = {
    onContextMenu: (payload) => {
      closeMenus();
      setLinkContextMenu(payload);
    },
    onCtrlOpen: (href) => {
      window.open(href, '_blank', 'noopener,noreferrer');
    },
  };

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: false,
        blockquote: false,
        horizontalRule: false,
        // TipTap v3 StarterKit includes Link/Underline; use EditorLink instead.
        link: false,
      }),
      ...extraExtensions,
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      ...(enableLinks
        ? [
            EditorLink.configure({
              openOnClick: false,
              autolink: true,
              defaultProtocol: 'https',
              HTMLAttributes: {
                target: null,
                rel: 'noopener noreferrer nofollow',
                class: 'rich-text-link',
              },
              isAllowedUri: (url, ctx) =>
                ctx.defaultValidate(url) && isValidLinkUrl(url),
              shouldAutoLink: (url) => isValidLinkUrl(url),
            }),
          ]
        : []),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
      ...(enableLinks
        ? [createLinkInteractionExtension(() => linkHandlersRef.current)]
        : []),
      NativeTextSelection,
      Extension.create({
        name: 'richTextHotkeys',
        addKeyboardShortcuts() {
          return {
            'Mod-Shift-8': () => this.editor.commands.toggleBulletList(),
            'Mod-Shift-7': () => this.editor.commands.toggleOrderedList(),
            ...(enableLinks ? { 'Mod-k': () => openAddLinkDialog() } : {}),
          };
        },
      }),
    ],
    content: value ?? defaultValue,
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      const html = toStoredRichTextHtml(current.getHTML());
      lastEmittedHtmlRef.current = html;
      onChange?.(html);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || value === undefined) {
      return;
    }
    if (value === lastEmittedHtmlRef.current) {
      return;
    }
    const currentStored = toStoredRichTextHtml(editor.getHTML());
    if (value === currentStored) {
      lastEmittedHtmlRef.current = value;
      return;
    }
    editor.commands.setContent(value, { emitUpdate: false });
    lastEmittedHtmlRef.current = value;
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Refresh placeholder decoration when the prop changes (locale switch, etc.).
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholder]);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }
    const dom = editor.view.dom;
    const syncModifier = (event: KeyboardEvent | MouseEvent) => {
      const held = event.ctrlKey || event.metaKey;
      setCtrlHeld(held);
      dom.classList.toggle('rich-text-ctrl-held', held);
    };
    const clearModifier = () => {
      setCtrlHeld(false);
      dom.classList.remove('rich-text-ctrl-held');
    };
    window.addEventListener('keydown', syncModifier);
    window.addEventListener('keyup', syncModifier);
    window.addEventListener('mousemove', syncModifier);
    window.addEventListener('blur', clearModifier);
    return () => {
      window.removeEventListener('keydown', syncModifier);
      window.removeEventListener('keyup', syncModifier);
      window.removeEventListener('mousemove', syncModifier);
      window.removeEventListener('blur', clearModifier);
      dom.classList.remove('rich-text-ctrl-held');
    };
  }, [editor]);

  useEffect(() => {
    if (!linkContextMenu) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      // Ignore the right-button release sequence that opened the menu.
      if (event.button === 2) {
        return;
      }
      const target = event.target as Node;
      if (
        linkContextMenuRef.current &&
        !linkContextMenuRef.current.contains(target)
      ) {
        closeLinkContextMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLinkContextMenu();
      }
    };
    // Defer so the opening contextmenu event cannot clear the menu.
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('keydown', onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [linkContextMenu]);

  useEffect(() => {
    if (!colorMenuOpen && !sizeMenuOpen && !moreOpen) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        colorMenuOpen &&
        colorWrapRef.current &&
        !colorWrapRef.current.contains(target)
      ) {
        // Native <input type="color"> pickers live outside the React tree;
        // keep the menu mounted while that input is focused so drag works.
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement &&
          active.type === 'color' &&
          colorWrapRef.current.contains(active)
        ) {
          return;
        }
        setColorMenuOpen(false);
      }
      if (
        sizeMenuOpen &&
        sizeWrapRef.current &&
        !sizeWrapRef.current.contains(target)
      ) {
        setSizeMenuOpen(false);
      }
      if (
        moreOpen &&
        moreWrapRef.current &&
        !moreWrapRef.current.contains(target)
      ) {
        setMoreOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [colorMenuOpen, sizeMenuOpen, moreOpen]);

  const applyLink = () => {
    if (!editor) {
      return;
    }
    const normalized = normalizeLinkUrl(linkUrl);
    if (!normalized) {
      setLinkError(true);
      return;
    }
    if (linkMode === 'add') {
      if (!hasNonEmptyTextSelection(editor)) {
        closeLinkDialog();
        return;
      }
      editor.chain().focus().setLink({ href: normalized }).run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: normalized })
        .run();
    }
    closeLinkDialog();
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    closeLinkContextMenu();
  };

  const copyLink = async (href: string) => {
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      // Best-effort.
    }
    closeLinkContextMenu();
  };

  const openLink = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    closeLinkContextMenu();
  };

  const runAfterCommand = (fromOverflowMenu: boolean) => {
    if (fromOverflowMenu) {
      setMoreOpen(false);
    }
  };

  const toggleMark = (id: MarkCommandId, fromOverflowMenu = false) => {
    if (!editor) {
      return;
    }
    const chain = editor.chain().focus();
    switch (id) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      default:
        break;
    }
    runAfterCommand(fromOverflowMenu);
  };

  const setAlign = (align: TextAlignValue, fromOverflowMenu = false) => {
    editor?.chain().focus().setTextAlign(align).run();
    runAfterCommand(fromOverflowMenu);
  };

  const applyColor = (color: string) => {
    // Do not focus the editor here — that blurs <input type="color"> and
    // dismisses the native palette while the user is still dragging.
    editor?.chain().setColor(color).run();
  };

  const selectColor = (color: string) => {
    editor?.chain().focus().setColor(color).run();
    setColorMenuOpen(false);
    setMoreOpen(false);
  };

  const dismissColorMenu = () => {
    setColorMenuOpen(false);
    setMoreOpen(false);
  };

  const selectFontSize = (size: string | null) => {
    if (size) {
      editor?.chain().focus().setFontSize(size).run();
    } else {
      editor?.chain().focus().unsetFontSize().run();
    }
    setSizeMenuOpen(false);
    setMoreOpen(false);
  };

  const toggleColorMenu = (fromOverflow = false) => {
    setSizeMenuOpen(false);
    if (!fromOverflow) {
      setMoreOpen(false);
    }
    setColorMenuOpen((open) => !open);
  };

  const toggleSizeMenu = (fromOverflow = false) => {
    setColorMenuOpen(false);
    if (!fromOverflow) {
      setMoreOpen(false);
    }
    setSizeMenuOpen((open) => !open);
  };

  const toggleMore = () => {
    setColorMenuOpen(false);
    setSizeMenuOpen(false);
    setMoreOpen((open) => !open);
  };

  const onLinkClick = () => {
    closeMenus();
    if (canEditLink(editor)) {
      openEditLinkDialog();
      return;
    }
    openAddLinkDialog();
  };

  const currentColor =
    (editor?.getAttributes('textStyle').color as string | undefined) ||
    '#424242';
  const currentFontSize =
    (editor?.getAttributes('textStyle').fontSize as string | undefined) || '';

  const activeMarks: Record<MarkCommandId, boolean> = {
    bold: Boolean(editor?.isActive('bold')),
    italic: Boolean(editor?.isActive('italic')),
    underline: Boolean(editor?.isActive('underline')),
    strike: Boolean(editor?.isActive('strike')),
    bulletList: Boolean(editor?.isActive('bulletList')),
    orderedList: Boolean(editor?.isActive('orderedList')),
  };

  let activeAlign: TextAlignValue | null = null;
  if (editor?.isActive({ textAlign: 'left' })) {
    activeAlign = 'left';
  } else if (editor?.isActive({ textAlign: 'center' })) {
    activeAlign = 'center';
  } else if (editor?.isActive({ textAlign: 'right' })) {
    activeAlign = 'right';
  }

  return {
    editor,
    labels,
    focused,
    ctrlHeld,
    linkOpen,
    closeLinkDialog,
    linkUrl,
    setLinkUrl,
    linkError,
    openEditLinkDialog,
    applyLink,
    removeLink,
    copyLink,
    openLink,
    linkContextMenu,
    linkContextMenuRef,
    closeLinkContextMenu,
    canAddLink: canAddLink(editor),
    canEditLink: canEditLink(editor),
    isLinkActive: Boolean(editor?.isActive('link')),
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
    onLinkClick,
  };
}
