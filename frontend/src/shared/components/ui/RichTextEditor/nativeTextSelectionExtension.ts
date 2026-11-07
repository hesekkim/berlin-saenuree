import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { isTouchLikePointer } from './isTouchLikePointer';

/**
 * Skip ProseMirror mouse click-counting on touch so double-tap is not treated
 * as a triple-click (whole-block select).
 */
export const NativeTextSelection = Extension.create({
  name: 'nativeTextSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('nativeTextSelection'),
        props: {
          handleDOMEvents: {
            mousedown: (_view, event) => isTouchLikePointer(event),
          },
        },
      }),
    ];
  },
});
