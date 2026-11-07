export type RichTextEditorLabels = {
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  bulletList: string;
  orderedList: string;
  textColor: string;
  fontSize: string;
  fontSizeDefault: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  link: string;
  linkUrl: string;
  linkApply: string;
  linkRemove: string;
  linkCancel: string;
  linkCopy: string;
  linkOpen: string;
  linkEdit: string;
  linkNeedsSelection: string;
  linkInvalidUrl: string;
  closeDialog: string;
  toolbar: string;
  more: string;
  insertImage: string;
  attachFile: string;
  attachmentDownload: string;
  attachmentRemove: string;
  attachmentDownloadFailed: string;
  attachmentFallbackName: string;
  uploadTooLarge: string;
  uploadTypeNotAllowed: string;
  uploadFailed: string;
};

export const DEFAULT_RICH_TEXT_LABELS: RichTextEditorLabels = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  textColor: 'Font color',
  fontSize: 'Font size',
  fontSizeDefault: 'Default',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  link: 'Link',
  linkUrl: 'URL',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
  linkCancel: 'Cancel',
  linkCopy: 'Copy link',
  linkOpen: 'Open link',
  linkEdit: 'Edit link',
  linkNeedsSelection: 'Select text first to add a link',
  linkInvalidUrl: 'Invalid URL',
  closeDialog: 'Close',
  toolbar: 'Formatting',
  more: 'More options',
  insertImage: 'Insert image',
  attachFile: 'Attach file',
  attachmentDownload: 'Download',
  attachmentRemove: 'Remove',
  attachmentDownloadFailed: 'Download failed.',
  attachmentFallbackName: 'Attached file',
  uploadTooLarge: 'File is too large.',
  uploadTypeNotAllowed: 'File type is not allowed.',
  uploadFailed: 'Upload failed.',
};

/** German labels matching Teams-style wording the product asked for. */
export const DE_RICH_TEXT_LABELS: RichTextEditorLabels = {
  bold: 'Fett',
  italic: 'Kursiv',
  underline: 'Unterstreichen',
  strike: 'Durchgestrichen',
  bulletList: 'Aufzählung',
  orderedList: 'Nummerierte Liste',
  textColor: 'Schriftfarbe',
  fontSize: 'Schriftgrad',
  fontSizeDefault: 'Standard',
  alignLeft: 'Linksbündig',
  alignCenter: 'Zentriert',
  alignRight: 'Rechtsbündig',
  link: 'Link',
  linkUrl: 'URL',
  linkApply: 'Übernehmen',
  linkRemove: 'Link entfernen',
  linkCancel: 'Abbrechen',
  linkCopy: 'Link kopieren',
  linkOpen: 'Link öffnen',
  linkEdit: 'Link bearbeiten',
  linkNeedsSelection: 'Zum Hinzufügen zuerst Text auswählen',
  linkInvalidUrl: 'Ungültige URL',
  closeDialog: 'Schließen',
  toolbar: 'Formatierung',
  more: 'Weitere Optionen',
  insertImage: 'Bild einfügen',
  attachFile: 'Datei anhängen',
  attachmentDownload: 'Herunterladen',
  attachmentRemove: 'Entfernen',
  attachmentDownloadFailed: 'Download fehlgeschlagen.',
  attachmentFallbackName: 'Angehängte Datei',
  uploadTooLarge: 'Die Datei ist zu groß.',
  uploadTypeNotAllowed: 'Dateityp ist nicht zulässig.',
  uploadFailed: 'Upload fehlgeschlagen.',
};

export const KO_RICH_TEXT_LABELS: RichTextEditorLabels = {
  bold: '굵게',
  italic: '기울임',
  underline: '밑줄',
  strike: '취소선',
  bulletList: '글머리 기호',
  orderedList: '번호 매기기',
  textColor: '글자색',
  fontSize: '글자 크기',
  fontSizeDefault: '기본',
  alignLeft: '왼쪽 정렬',
  alignCenter: '가운데 정렬',
  alignRight: '오른쪽 정렬',
  link: '링크',
  linkUrl: 'URL',
  linkApply: '적용',
  linkRemove: '링크 제거',
  linkCancel: '취소',
  linkCopy: '링크 복사',
  linkOpen: '링크 열기',
  linkEdit: '링크 편집',
  linkNeedsSelection: '링크를 추가하려면 먼저 텍스트를 선택하세요',
  linkInvalidUrl: '유효하지 않은 URL',
  closeDialog: '닫기',
  toolbar: '서식',
  more: '더보기',
  insertImage: '이미지 삽입',
  attachFile: '파일 첨부',
  attachmentDownload: '다운로드',
  attachmentRemove: '삭제',
  attachmentDownloadFailed: '다운로드에 실패했습니다.',
  attachmentFallbackName: '첨부 파일',
  uploadTooLarge: '파일 크기가 너무 큽니다.',
  uploadTypeNotAllowed: '허용되지 않는 파일 형식입니다.',
  uploadFailed: '업로드에 실패했습니다.',
};

export const FONT_SIZE_OPTIONS = [
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '24px', label: '24' },
] as const;

export type RichTextEditorProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  labels?: Partial<RichTextEditorLabels>;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the editor surface. */
  'aria-label'?: string;
};

export type LinkDialogMode = 'add' | 'edit';

export type LinkContextMenuState = {
  x: number;
  y: number;
  href: string;
};
