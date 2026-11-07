import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { createMediaKeyboardShortcuts } from '../../src/shared/components/ui/RichTextEditorEX/mediaKeyboard';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    mediaAttachment: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: false,
      toDOM: () => ['a'],
    },
    mediaImage: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      toDOM: () => ['img'],
    },
  },
});

type CommandCall = { name: string; args: unknown[] };

function makeEditor(state: EditorState) {
  const calls: CommandCall[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return true;
    };
  return {
    calls,
    editor: {
      state,
      commands: {
        setTextSelection: record('setTextSelection'),
        setNodeSelection: record('setNodeSelection'),
        deleteRange: record('deleteRange'),
        splitBlock: record('splitBlock'),
      },
    },
  };
}

/** `<p>ab{media}cd</p>` — left caret is 3, right caret is 4. */
function docWithMedia(nodeName: 'mediaAttachment' | 'mediaImage') {
  return schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.text('ab'),
      schema.node(nodeName),
      schema.text('cd'),
    ]),
  ]);
}

const LEFT_CARET = 3;
const RIGHT_CARET = 4;

function runShortcut(
  key: 'ArrowRight' | 'ArrowLeft' | 'Backspace' | 'Delete',
  nodeName: 'mediaAttachment' | 'mediaImage',
  state: EditorState,
) {
  const { editor, calls } = makeEditor(state);
  const shortcuts = createMediaKeyboardShortcuts(nodeName);
  // The fake only implements the commands these handlers reach for.
  const handled = shortcuts[key]({ editor } as never);
  return { handled, calls };
}

function caretAt(
  pos: number,
  nodeName: 'mediaAttachment' | 'mediaImage' = 'mediaAttachment',
) {
  const doc = docWithMedia(nodeName);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

describe.each(['mediaAttachment', 'mediaImage'] as const)(
  'media keyboard navigation (%s)',
  (nodeName) => {
    it('jumps the caret across the node instead of selecting it', () => {
      const { handled, calls } = runShortcut(
        'ArrowRight',
        nodeName,
        caretAt(LEFT_CARET, nodeName),
      );
      expect(handled).toBe(true);
      expect(calls).toEqual([
        { name: 'setTextSelection', args: [RIGHT_CARET] },
      ]);
    });

    it('jumps back across the node on ArrowLeft', () => {
      const { handled, calls } = runShortcut(
        'ArrowLeft',
        nodeName,
        caretAt(RIGHT_CARET, nodeName),
      );
      expect(handled).toBe(true);
      expect(calls).toEqual([{ name: 'setTextSelection', args: [LEFT_CARET] }]);
    });

    it('never produces a NodeSelection from the keyboard', () => {
      for (const pos of [LEFT_CARET, RIGHT_CARET]) {
        for (const key of ['ArrowRight', 'ArrowLeft'] as const) {
          const { calls } = runShortcut(key, nodeName, caretAt(pos, nodeName));
          expect(calls.map((call) => call.name)).not.toContain(
            'setNodeSelection',
          );
        }
      }
    });

    it('deletes the node with Backspace from the right caret', () => {
      const { handled, calls } = runShortcut(
        'Backspace',
        nodeName,
        caretAt(RIGHT_CARET, nodeName),
      );
      expect(handled).toBe(true);
      expect(calls).toEqual([
        { name: 'deleteRange', args: [{ from: LEFT_CARET, to: RIGHT_CARET }] },
      ]);
    });

    it('deletes the node with Delete from the left caret', () => {
      const { handled, calls } = runShortcut(
        'Delete',
        nodeName,
        caretAt(LEFT_CARET, nodeName),
      );
      expect(handled).toBe(true);
      expect(calls).toEqual([
        { name: 'deleteRange', args: [{ from: LEFT_CARET, to: RIGHT_CARET }] },
      ]);
    });

    it('stays out of the way when the caret is not next to the node', () => {
      const away = caretAt(1, nodeName);
      for (const key of [
        'ArrowRight',
        'ArrowLeft',
        'Backspace',
        'Delete',
      ] as const) {
        const { handled, calls } = runShortcut(key, nodeName, away);
        expect(handled).toBe(false);
        expect(calls).toEqual([]);
      }
    });

    it('ignores a node of a different type', () => {
      const other =
        nodeName === 'mediaAttachment' ? 'mediaImage' : 'mediaAttachment';
      const { handled, calls } = runShortcut(
        'ArrowRight',
        nodeName,
        caretAt(LEFT_CARET, other),
      );
      expect(handled).toBe(false);
      expect(calls).toEqual([]);
    });
  },
);

describe('media keyboard navigation edge cases', () => {
  it('does not split the block at the end of a paragraph', () => {
    // Regression: ArrowRight used to insert an empty paragraph here, which
    // mutates the document from a navigation key.
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('ab'),
        schema.node('mediaAttachment'),
      ]),
      schema.node('paragraph', null, [schema.text('next')]),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, RIGHT_CARET),
    });

    const { handled, calls } = runShortcut(
      'ArrowRight',
      'mediaAttachment',
      state,
    );
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('escapes a click-made NodeSelection on the image to a text caret', () => {
    const doc = docWithMedia('mediaImage');
    const selected = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, LEFT_CARET),
    });

    expect(runShortcut('ArrowRight', 'mediaImage', selected).calls).toEqual([
      { name: 'setTextSelection', args: [RIGHT_CARET] },
    ]);
    expect(runShortcut('ArrowLeft', 'mediaImage', selected).calls).toEqual([
      { name: 'setTextSelection', args: [LEFT_CARET] },
    ]);
  });

  it('leaves a NodeSelection on some other node alone', () => {
    const doc = docWithMedia('mediaImage');
    const selected = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, LEFT_CARET),
    });

    const { handled, calls } = runShortcut(
      'ArrowRight',
      'mediaAttachment',
      selected,
    );
    expect(handled).toBe(false);
    expect(calls).toEqual([]);
  });
});
