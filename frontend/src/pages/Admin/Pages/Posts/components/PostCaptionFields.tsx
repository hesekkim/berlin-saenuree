import Select from '../../../../../shared/components/ui/Select/Select';
import SlideToggle from '../../../../../shared/components/ui/SlideToggle/SlideToggle';
import RichTextEditor, {
  DEFAULT_RICH_TEXT_LABELS,
  DE_RICH_TEXT_LABELS,
  KO_RICH_TEXT_LABELS,
} from '../../../../../shared/components/ui/RichTextEditor';
import type { PostCopy } from '../../../../../shared/api/postsApi';
import styles from './PostComposerDialog.module.css';

function richTextLabelsForAdmin(language: string) {
  if (language === 'ko') {
    return KO_RICH_TEXT_LABELS;
  }
  if (language === 'de') {
    return DE_RICH_TEXT_LABELS;
  }
  return DEFAULT_RICH_TEXT_LABELS;
}

export type PostCaptionFieldsProps = {
  languageOptions: { value: string; label: string }[];
  editLanguage: string;
  onEditLanguageChange: (language: string) => void;
  copies: Record<string, PostCopy>;
  onCopyBodyChange: (body: string) => void;
  published: boolean;
  onPublishedChange: (published: boolean) => void;
  adminLanguage: string;
  labels: {
    postsLanguageLabel: string;
    postsCaptionLabel: string;
    postsCaptionPlaceholder: string;
    postsPublishedLabel: string;
    postsPublishedHint: string;
  };
  editorKey: string;
  disabled?: boolean;
  showEnabled?: boolean;
  showEnabledHint?: boolean;
};

/** Step-3 / edit-form caption fields — no Dialog or wizard step dependency. */
export default function PostCaptionFields({
  languageOptions,
  editLanguage,
  onEditLanguageChange,
  copies,
  onCopyBodyChange,
  published,
  onPublishedChange,
  adminLanguage,
  labels,
  editorKey,
  disabled = false,
  showEnabled = true,
  showEnabledHint = true,
}: PostCaptionFieldsProps) {
  const currentBody = copies[editLanguage]?.body ?? '';

  return (
    <div className={styles.captionFields}>
      <div className={styles.publishRow}>
        {showEnabledHint ? (
          <p className={styles.fieldHint}>{labels.postsPublishedHint}</p>
        ) : null}
        {showEnabled ? (
          <SlideToggle
            label={labels.postsPublishedLabel}
            checked={published}
            onChange={onPublishedChange}
            disabled={disabled}
          />
        ) : null}
      </div>

      <Select
        label={labels.postsLanguageLabel}
        options={languageOptions}
        value={editLanguage}
        onChange={onEditLanguageChange}
        disabled={disabled}
      />

      <div className={styles.richTextField}>
        <span className={styles.richTextLabel}>{labels.postsCaptionLabel}</span>
        <RichTextEditor
          key={`${editorKey}-${editLanguage}`}
          value={currentBody}
          onChange={onCopyBodyChange}
          placeholder={labels.postsCaptionPlaceholder}
          labels={richTextLabelsForAdmin(adminLanguage)}
          aria-label={labels.postsCaptionLabel}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
