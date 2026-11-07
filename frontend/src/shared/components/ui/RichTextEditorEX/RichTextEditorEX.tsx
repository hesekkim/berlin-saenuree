import { EditorContent } from '@tiptap/react';
import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  optimizeMediaImage,
  uploadMediaFile,
  type MediaFileResponse,
} from '../../../api/mediaApi';
import { validateUploadFile } from '../Upload/uploadValidation';
import LinkContextMenu from '../RichTextEditor/LinkContextMenu';
import LinkDialog from '../RichTextEditor/LinkDialog';
import RichTextToolbar from '../RichTextEditor/Toolbar';
import { useRichTextEditor } from '../RichTextEditor/useRichTextEditor';
import type { RichTextEditorProps } from '../RichTextEditor/types';
import { MediaAttachment, MediaImage } from './mediaNodes';
import { RichTextEditorExContext } from './RichTextEditorExContext';
import { useMediaOwnership } from './useMediaOwnership';
import styles from './RichTextEditorEX.module.css';
import editorStyles from '../RichTextEditor/RichTextEditor.module.css';

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const FILE_ACCEPT = 'application/pdf,.pdf,.docx,.xlsx,.pptx,.zip';
/** Mirrors backend `APP_MEDIA_MAX_FILE_BYTES`; the server enforces the cap. */
export const MEDIA_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export type RichTextEditorEXHandle = {
  /** Call after a successful save so uploads survive unmount and form reset. */
  commitUploadedMedia: () => void;
  /** Call on cancel to delete everything uploaded in this session. */
  discardUploadedMedia: () => Promise<void>;
  getUploadedMediaIds: () => string[];
};

export type RichTextEditorEXProps = RichTextEditorProps & {
  ref?: Ref<RichTextEditorEXHandle>;
};

function uploadErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } })
      .response;
    if (typeof response?.data?.detail === 'string') {
      return response.data.detail;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export default function RichTextEditorEX({
  ref,
  ...props
}: RichTextEditorEXProps) {
  const {
    value,
    defaultValue,
    onChange,
    placeholder = 'Enter message',
    labels: labelsProp,
    disabled = false,
    className = '',
    'aria-label': ariaLabel,
  } = props;
  const base = useRichTextEditor({
    value,
    defaultValue,
    onChange,
    placeholder,
    labels: labelsProp,
    disabled,
    enableLinks: true,
    extraExtensions: [MediaImage, MediaAttachment],
  });
  const { editor, labels } = base;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownership = useMediaOwnership(editor);
  const nodeViewContext = useMemo(() => ({ labels }), [labels]);

  useImperativeHandle(
    ref,
    () => ({
      commitUploadedMedia: ownership.commit,
      discardUploadedMedia: ownership.discardAll,
      getUploadedMediaIds: ownership.getTrackedIds,
    }),
    [ownership],
  );

  const insertUploadedFile = (
    uploadedFile: MediaFileResponse,
    optimizedImageId?: string,
  ): boolean => {
    const isImage = uploadedFile.contentType.startsWith('image/');
    const inserted = editor
      ?.chain()
      .focus()
      .insertContent({
        type: isImage ? 'mediaImage' : 'mediaAttachment',
        attrs: isImage
          ? {
              mediaId: uploadedFile.id,
              imageId: optimizedImageId ?? null,
              alt: uploadedFile.originalName,
            }
          : {
              mediaId: uploadedFile.id,
              name: uploadedFile.originalName,
              contentType: uploadedFile.contentType,
              sizeBytes: uploadedFile.sizeBytes,
            },
      })
      .run();
    if (!inserted) {
      return false;
    }
    ownership.track(uploadedFile.id, optimizedImageId);
    return true;
  };

  const uploadAndInsert = async (file: File) => {
    const accept = file.type.startsWith('image/') ? IMAGE_ACCEPT : FILE_ACCEPT;
    const validation = validateUploadFile(file, {
      accept,
      maxSizeBytes: MEDIA_MAX_SIZE_BYTES,
    });
    if (!validation.ok) {
      setUploadError(
        validation.code === 'size_exceeded'
          ? labels.uploadTooLarge
          : labels.uploadTypeNotAllowed,
      );
      return;
    }

    let uploaded: MediaFileResponse | null = null;
    try {
      uploaded = await uploadMediaFile(file, {
        accept,
        maxSizeBytes: MEDIA_MAX_SIZE_BYTES,
      });
      let optimizedImageId: string | undefined;
      if (file.type.startsWith('image/')) {
        try {
          const optimized = await optimizeMediaImage(uploaded.id, ['display']);
          optimizedImageId = optimized.imageId;
        } catch {
          await ownership.discardOne(uploaded.id);
          setUploadError(labels.uploadFailed);
          return;
        }
      }
      if (!insertUploadedFile(uploaded, optimizedImageId)) {
        await ownership.discardOne(uploaded.id);
        if (optimizedImageId) {
          await ownership.discardOne(optimizedImageId);
        }
        setUploadError(labels.uploadFailed);
      }
    } catch (error) {
      if (uploaded) {
        await ownership.discardOne(uploaded.id);
      }
      setUploadError(uploadErrorMessage(error, labels.uploadFailed));
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (disabled || uploading || !editor?.isEditable || selected.length === 0) {
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of selected) {
        await uploadAndInsert(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const rootClass = [
    editorStyles.root,
    styles.root,
    base.focused ? editorStyles.rootFocused : '',
    disabled ? editorStyles.rootDisabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const surfaceClass = [
    editorStyles.surface,
    styles.surface,
    base.ctrlHeld ? editorStyles.surfaceCtrlHeld : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <RichTextEditorExContext.Provider value={nodeViewContext}>
      <div
        className={rootClass}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) {
            return;
          }
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
          }
        }}
        onPaste={(event) => {
          if (!event.clipboardData.files.length) {
            return;
          }
          event.preventDefault();
          void handleFiles(event.clipboardData.files);
        }}
      >
        <RichTextToolbar
          labels={labels}
          disabled={disabled || uploading}
          activeMarks={base.activeMarks}
          activeAlign={base.activeAlign}
          isLinkActive={base.isLinkActive}
          canAddLink={base.canAddLink}
          canEditLink={base.canEditLink}
          currentColor={base.currentColor}
          currentFontSize={base.currentFontSize}
          colorMenuOpen={base.colorMenuOpen}
          sizeMenuOpen={base.sizeMenuOpen}
          moreOpen={base.moreOpen}
          colorWrapRef={base.colorWrapRef}
          sizeWrapRef={base.sizeWrapRef}
          moreWrapRef={base.moreWrapRef}
          onToggleMark={base.toggleMark}
          onSetAlign={base.setAlign}
          onToggleColorMenu={base.toggleColorMenu}
          onToggleSizeMenu={base.toggleSizeMenu}
          onToggleMore={base.toggleMore}
          onSelectColor={base.selectColor}
          onApplyColor={base.applyColor}
          onDismissColorMenu={base.dismissColorMenu}
          onSelectFontSize={base.selectFontSize}
          onLinkClick={base.onLinkClick}
          includeLink
          includeUpload
          onInsertImage={() => imageInputRef.current?.click()}
          onInsertAttachment={() => fileInputRef.current?.click()}
        />
        <EditorContent
          editor={editor}
          className={surfaceClass}
          aria-label={ariaLabel ?? placeholder}
        />
        <input
          ref={imageInputRef}
          hidden
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(event) => {
            void handleFiles(event.target.files ?? []);
            event.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept={FILE_ACCEPT}
          onChange={(event) => {
            void handleFiles(event.target.files ?? []);
            event.target.value = '';
          }}
        />
        <LinkDialog
          isOpen={base.linkOpen}
          labels={labels}
          url={base.linkUrl}
          error={base.linkError}
          onUrlChange={base.setLinkUrl}
          onClose={base.closeLinkDialog}
          onApply={base.applyLink}
        />
        {base.linkContextMenu ? (
          <LinkContextMenu
            menu={base.linkContextMenu}
            labels={labels}
            menuRef={base.linkContextMenuRef}
            onClose={base.closeLinkContextMenu}
            onCopy={base.copyLink}
            onOpen={base.openLink}
            onEdit={base.openEditLinkDialog}
            onRemove={base.removeLink}
          />
        ) : null}
        {uploadError ? (
          <p className={styles.status} role="alert">
            {uploadError}
          </p>
        ) : null}
      </div>
    </RichTextEditorExContext.Provider>
  );
}
