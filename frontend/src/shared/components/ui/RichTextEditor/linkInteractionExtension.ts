import { Extension } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { readAnchorHref } from './editorLink';
import { isTouchLikePointer } from './isTouchLikePointer';

export type LinkInteractionHandlers = {
  onContextMenu: (payload: { x: number; y: number; href: string }) => void;
  onCtrlOpen: (href: string) => void;
};

const LONG_PRESS_MS = 550;
const MOVE_CANCEL_PX = 12;

function hrefFromCoords(
  view: EditorView,
  point: { clientX: number; clientY: number }
): string | null {
  const coords = view.posAtCoords({
    left: point.clientX,
    top: point.clientY,
  });
  if (!coords) {
    return null;
  }

  for (const pos of [coords.pos, Math.max(0, coords.pos - 1)]) {
    const marks = view.state.doc.resolve(pos).marks();
    const link = marks.find((mark) => mark.type.name === 'link');
    const href = link?.attrs.href;
    if (typeof href === 'string' && href.trim()) {
      return href.trim();
    }
  }
  return null;
}

function hrefFromEventTarget(
  view: EditorView,
  target: EventTarget | null,
  point: { clientX: number; clientY: number }
): string | null {
  if (target instanceof Element) {
    const anchor = target.closest('a');
    if (anchor instanceof HTMLAnchorElement) {
      const fromDom = readAnchorHref(anchor);
      if (fromDom) {
        return fromDom;
      }
    }
  }
  return hrefFromCoords(view, point);
}

/**
 * - Never navigates on plain click (editor anchors have no href).
 * - Desktop: Ctrl/Cmd+click opens; right-click shows actions.
 * - Mobile: long-press on a link shows the same actions (no right-click).
 */
export function createLinkInteractionExtension(
  getHandlers: () => LinkInteractionHandlers
) {
  return Extension.create({
    name: 'linkInteraction',

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        new Plugin({
          key: new PluginKey('linkInteraction'),
          view(editorView) {
            let longPressTimer: number | null = null;
            let pressStart: {
              x: number;
              y: number;
              href: string;
            } | null = null;
            let longPressArmed = false;

            const clearLongPress = () => {
              if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
              }
              pressStart = null;
              longPressArmed = false;
            };

            const openMenu = (x: number, y: number, href: string) => {
              const coords = editorView.posAtCoords({ left: x, top: y });
              if (coords) {
                // Avoid focus() so the menu can receive the next tap on mobile.
                editor
                  .chain()
                  .setTextSelection(coords.pos)
                  .extendMarkRange('link')
                  .run();
              }
              getHandlers().onContextMenu({ x, y, href });
            };

            const onClickCapture = (event: MouseEvent) => {
              const target = event.target;
              if (!(target instanceof Element) || !target.closest('a')) {
                return;
              }
              const href = hrefFromEventTarget(editorView, target, event);
              if (!href) {
                return;
              }
              event.preventDefault();
              if (event.button !== 0) {
                return;
              }
              if (isTouchLikePointer(event)) {
                return;
              }
              if (event.ctrlKey || event.metaKey) {
                getHandlers().onCtrlOpen(href);
              }
            };

            const onAuxClickCapture = (event: MouseEvent) => {
              const target = event.target;
              if (!(target instanceof Element)) {
                return;
              }
              if (target.closest('a') && event.button === 1) {
                event.preventDefault();
              }
            };

            const onTouchStart = (event: TouchEvent) => {
              if (event.touches.length !== 1) {
                clearLongPress();
                return;
              }
              const touch = event.touches[0];
              const href = hrefFromEventTarget(editorView, event.target, touch);
              if (!href) {
                clearLongPress();
                return;
              }
              clearLongPress();
              pressStart = { x: touch.clientX, y: touch.clientY, href };
              longPressTimer = window.setTimeout(() => {
                // Arm only — open on touchend so the finger-up is not part of
                // the menu interaction (otherwise taps on the menu are ignored).
                longPressArmed = true;
              }, LONG_PRESS_MS);
            };

            const onTouchMove = (event: TouchEvent) => {
              if (!pressStart || event.touches.length !== 1) {
                return;
              }
              const touch = event.touches[0];
              const dx = Math.abs(touch.clientX - pressStart.x);
              const dy = Math.abs(touch.clientY - pressStart.y);
              if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
                clearLongPress();
              }
            };

            const onTouchEnd = (event: TouchEvent) => {
              if (longPressArmed && pressStart) {
                const { x, y, href } = pressStart;
                clearLongPress();
                event.preventDefault();
                openMenu(x, y, href);
                return;
              }
              clearLongPress();
            };

            const onTouchCancel = () => clearLongPress();

            editorView.dom.addEventListener('click', onClickCapture, true);
            editorView.dom.addEventListener('auxclick', onAuxClickCapture, true);
            editorView.dom.addEventListener('touchstart', onTouchStart, {
              passive: true,
            });
            editorView.dom.addEventListener('touchmove', onTouchMove, {
              passive: true,
            });
            editorView.dom.addEventListener('touchend', onTouchEnd, {
              passive: false,
            });
            editorView.dom.addEventListener('touchcancel', onTouchCancel);

            return {
              destroy() {
                clearLongPress();
                editorView.dom.removeEventListener(
                  'click',
                  onClickCapture,
                  true
                );
                editorView.dom.removeEventListener(
                  'auxclick',
                  onAuxClickCapture,
                  true
                );
                editorView.dom.removeEventListener('touchstart', onTouchStart);
                editorView.dom.removeEventListener('touchmove', onTouchMove);
                editorView.dom.removeEventListener('touchend', onTouchEnd);
                editorView.dom.removeEventListener(
                  'touchcancel',
                  onTouchCancel
                );
              },
            };
          },
          props: {
            handleDOMEvents: {
              contextmenu: (view, event) => {
                if (isTouchLikePointer(event)) {
                  return false;
                }
                const href = hrefFromEventTarget(view, event.target, event);
                if (!href) {
                  return false;
                }
                event.preventDefault();
                event.stopPropagation();

                const coords = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });
                if (coords) {
                  editor
                    .chain()
                    .setTextSelection(coords.pos)
                    .extendMarkRange('link')
                    .run();
                }

                getHandlers().onContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  href,
                });
                return true;
              },
            },
          },
        }),
      ];
    },
  });
}
