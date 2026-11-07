import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { normalizeMediaSizeBytes } from '../../../lib/richText';
import AttachmentCard from './AttachmentCard';
import { useRichTextEditorExContext } from './RichTextEditorExContext';
import styles from './RichTextEditorEX.module.css';

export default function MediaAttachmentNodeView({
  node,
  editor,
  deleteNode,
}: NodeViewProps) {
  const { labels } = useRichTextEditorExContext();

  return (
    <NodeViewWrapper
      as="span"
      className={styles.attachmentNode}
      data-media-node="attachment"
      contentEditable={false}
    >
      <AttachmentCard
        mediaId={String(node.attrs.mediaId ?? '')}
        name={String(node.attrs.name ?? '')}
        sizeBytes={normalizeMediaSizeBytes(node.attrs.sizeBytes)}
        labels={labels}
        disabled={!editor.isEditable}
        onRemove={deleteNode}
      />
    </NodeViewWrapper>
  );
}
