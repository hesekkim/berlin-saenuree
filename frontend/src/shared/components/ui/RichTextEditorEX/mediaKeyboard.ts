import type { KeyboardShortcutCommand } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * Arrow keys step the caret from one side of a media node straight to the
 * other, so walking past a node never leaves a NodeSelection active and the
 * next keystroke cannot replace a node the user only navigated over.
 *
 * Clicking a node whose spec is `selectable` still selects it. That is the
 * only way to reach a NodeSelection, and it is what the image resize
 * affordance hangs off.
 */
export function createMediaKeyboardShortcuts(
  nodeName: string,
): Record<string, KeyboardShortcutCommand> {
  return {
    ArrowRight: ({ editor }) => {
      const { selection } = editor.state;
      if (selection instanceof NodeSelection) {
        return selection.node.type.name === nodeName
          ? editor.commands.setTextSelection(selection.to)
          : false;
      }
      const after = selection.empty ? selection.$from.nodeAfter : null;
      if (!after || after.type.name !== nodeName) {
        return false;
      }
      return editor.commands.setTextSelection(selection.from + after.nodeSize);
    },

    ArrowLeft: ({ editor }) => {
      const { selection } = editor.state;
      if (selection instanceof NodeSelection) {
        return selection.node.type.name === nodeName
          ? editor.commands.setTextSelection(selection.from)
          : false;
      }
      const before = selection.empty ? selection.$from.nodeBefore : null;
      if (!before || before.type.name !== nodeName) {
        return false;
      }
      return editor.commands.setTextSelection(selection.from - before.nodeSize);
    },

    // Without a reachable NodeSelection these are the only keyboard delete
    // paths; the browser's contentEditable fallback is not consistent for an
    // atom rendered by a `contentEditable={false}` node view.
    Backspace: ({ editor }) => {
      const { selection } = editor.state;
      const before = selection.empty ? selection.$from.nodeBefore : null;
      if (!before || before.type.name !== nodeName) {
        return false;
      }
      return editor.commands.deleteRange({
        from: selection.from - before.nodeSize,
        to: selection.from,
      });
    },

    Delete: ({ editor }) => {
      const { selection } = editor.state;
      const after = selection.empty ? selection.$from.nodeAfter : null;
      if (!after || after.type.name !== nodeName) {
        return false;
      }
      return editor.commands.deleteRange({
        from: selection.from,
        to: selection.from + after.nodeSize,
      });
    },
  };
}
