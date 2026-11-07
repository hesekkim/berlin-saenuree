import Button, {
  type ButtonVariant,
} from '../../shared/components/ui/Button/Button';
import Checkbox from '../../shared/components/ui/Checkbox/Checkbox';
import InputField from '../../shared/components/ui/InputField/InputField';
import RatingTag from '../../shared/components/ui/RatingTag/RatingTag';
import Select from '../../shared/components/ui/Select/Select';
import SidebarPanelIcon from '../../shared/components/ui/SidebarPanelIcon/SidebarPanelIcon';
import SlideToggle from '../../shared/components/ui/SlideToggle/SlideToggle';
import StatusTag, {
  type StatusTagVariant,
} from '../../shared/components/ui/StatusTag/StatusTag';
import TagSelector from '../../shared/components/ui/TagSelector/TagSelector';
import TocItem from '../../shared/components/ui/TocItem/TocItem';
import Upload from '../../shared/components/ui/Upload/Upload';
import RichTextEditor, {
  DE_RICH_TEXT_LABELS,
  DEFAULT_RICH_TEXT_LABELS,
} from '../../shared/components/ui/RichTextEditor';
import RichTextEditorEX from '../../shared/components/ui/RichTextEditorEX';
import {
  ToastProvider,
  useToast,
} from '../../shared/components/ui/Toast/ToastProvider';
import styles from './UiLab.module.css';
import { useUiLab } from './useUiLab';

const SELECT_OPTIONS = [
  { value: 'azure', label: 'Azure DevOps' },
  { value: 'jira', label: 'Jira' },
  { value: 'github', label: 'GitHub' },
];

const UPLOAD_ACCEPT_BY_MODE = {
  any: undefined,
  image: 'image/jpeg,image/png,image/webp',
  pdf: 'application/pdf,.pdf',
} as const;
const BUTTON_VARIANTS: ButtonVariant[] = [
  'primary',
  'primary-big',
  'secondary',
  'secondary-big',
  'danger',
];

const STATUS_VARIANTS: StatusTagVariant[] = [
  'open',
  'answered',
  'response-needed',
  'decided',
  'superseded',
  'deprecated',
  'readonly',
];

const RATING_SAMPLES = [
  'niedrig',
  'mittel',
  'gut',
  'sehr gut',
  'hoch',
  'unknown',
];

function ToastSection() {
  const toast = useToast();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Toast</h2>
      <p className={styles.meta}>
        Top-right stack. Click each variant to preview.
      </p>
      <div className={styles.row}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => toast.info('Saved successfully.')}
        >
          Info
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => toast.warning('Please check your input.')}
        >
          Warning
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => toast.error('Could not save. Please try again.')}
        >
          Error
        </Button>
      </div>
    </section>
  );
}

export default function UiLab() {
  const lab = useUiLab();

  return (
    <ToastProvider>
      <div className={`cms-theme ${styles.container}`}>
        <header className={styles.header}>
          <h1 className={styles.title}>UI Lab</h1>
          <p className={styles.subtitle}>
            Developer-only playground for shared UI primitives. Toggle states
            below to inspect variants. Disabled unless{' '}
            <code>VITE_ENABLE_UI_LAB=true</code>.
          </p>
        </header>

        <ToastSection />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Button</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              variant
              <select
                className={styles.selectNative}
                value={lab.buttonVariant}
                onChange={(e) =>
                  lab.setButtonVariant(e.target.value as ButtonVariant)
                }
              >
                {BUTTON_VARIANTS.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.buttonDisabled}
                onChange={(e) => lab.setButtonDisabled(e.target.checked)}
              />
              disabled
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.buttonFullWidth}
                onChange={(e) => lab.setButtonFullWidth(e.target.checked)}
              />
              fullWidth
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewWide}`}>
            <Button
              variant={lab.buttonVariant}
              disabled={lab.buttonDisabled}
              fullWidth={lab.buttonFullWidth}
              onClick={() => lab.setButtonClicks((n) => n + 1)}
            >
              Click me
            </Button>
            <p className={styles.meta}>clicks: {lab.buttonClicks}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>RichTextEditorEX</h2>
          <p className={styles.meta}>
            Extended editor: links, image/file insertion, paste, and drag/drop.
            Upload uses the authenticated media API and keeps references in the
            saved HTML.
          </p>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.richTextExDisabled}
                onChange={(e) => lab.setRichTextExDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewFull}`}>
            <RichTextEditorEX
              value={lab.richTextExValue}
              onChange={lab.setRichTextExValue}
              disabled={lab.richTextExDisabled}
              placeholder="Write a blogger post"
              labels={DEFAULT_RICH_TEXT_LABELS}
            />
          </div>
          <p className={styles.meta}>
            HTML length: {lab.richTextExValue.length}
          </p>
          <pre className={styles.meta}>{lab.richTextExValue}</pre>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>InputField</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.inputError}
                onChange={(e) => lab.setInputError(e.target.checked)}
              />
              error
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.inputDisabled}
                onChange={(e) => lab.setInputDisabled(e.target.checked)}
              />
              disabled
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.inputMultiline}
                onChange={(e) => lab.setInputMultiline(e.target.checked)}
              />
              multiline
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.inputClearable}
                onChange={(e) => lab.setInputClearable(e.target.checked)}
              />
              clearable
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewWide}`}>
            <InputField
              label="Label"
              value={lab.inputValue}
              onChange={lab.setInputValue}
              placeholder="Placeholder"
              error={lab.inputError}
              errorMessage="This field is required"
              disabled={lab.inputDisabled}
              multiline={lab.inputMultiline}
              clearable={lab.inputClearable}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Select</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.selectError}
                onChange={(e) => lab.setSelectError(e.target.checked)}
              />
              error
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.selectDisabled}
                onChange={(e) => lab.setSelectDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewWide}`}>
            <Select
              label="Tool"
              options={SELECT_OPTIONS}
              value={lab.selectValue}
              onChange={lab.setSelectValue}
              error={lab.selectError}
              errorMessage="Please choose a tool"
              disabled={lab.selectDisabled}
            />
            <p className={styles.meta}>value: {lab.selectValue || '(empty)'}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Checkbox</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.checkboxDisabled}
                onChange={(e) => lab.setCheckboxDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={styles.preview}>
            <Checkbox
              checked={lab.checkboxChecked}
              onChange={lab.setCheckboxChecked}
              disabled={lab.checkboxDisabled}
              ariaLabel="Demo checkbox"
            />
            <p className={styles.meta}>
              checked: {String(lab.checkboxChecked)}
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>SlideToggle</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.toggleDisabled}
                onChange={(e) => lab.setToggleDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={styles.preview}>
            <SlideToggle
              label="Notifications"
              checked={lab.toggleChecked}
              onChange={lab.setToggleChecked}
              disabled={lab.toggleDisabled}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>TagSelector</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.tagDisabled}
                onChange={(e) => lab.setTagDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={styles.preview}>
            <TagSelector
              label="Architecture"
              selected={lab.tagSelected}
              disabled={lab.tagDisabled}
              icon="plus"
              onClick={() => lab.setTagSelected((v) => !v)}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>StatusTag</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              variant
              <select
                className={styles.selectNative}
                value={lab.statusVariant}
                onChange={(e) =>
                  lab.setStatusVariant(e.target.value as StatusTagVariant)
                }
              >
                {STATUS_VARIANTS.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.preview}>
            <StatusTag variant={lab.statusVariant} />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>RatingTag</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              value
              <select
                className={styles.selectNative}
                value={lab.ratingValue}
                onChange={(e) => lab.setRatingValue(e.target.value)}
              >
                {RATING_SAMPLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.preview}>
            <RatingTag value={lab.ratingValue} />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>TocItem</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.tocActive}
                onChange={(e) => lab.setTocActive(e.target.checked)}
              />
              isActive
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.tocDisabled}
                onChange={(e) => lab.setTocDisabled(e.target.checked)}
              />
              isDisabled
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewWide}`}>
            <TocItem
              title="Category A"
              progress="3/5"
              isActive={lab.tocActive}
              isDisabled={lab.tocDisabled}
              onClick={() => lab.setTocActive((v) => !v)}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upload</h2>
          <p className={styles.meta}>
            Real upload hits <code>POST /api/v1/media/files</code>. Requires an{' '}
            authenticated CMS session: open <code>/admin</code>, log in, then
            come back here (same origin shares{' '}
            <code>localStorage.auth_token</code>). Without that token the API
            returns 403.
          </p>
          <p className={styles.meta}>
            auth_token: {lab.hasAuthToken ? 'present' : 'missing'}
          </p>
          <div className={styles.controls}>
            <label className={styles.control}>
              accept
              <select
                className={styles.selectNative}
                value={lab.uploadAcceptMode}
                onChange={(e) =>
                  lab.setUploadAcceptMode(
                    e.target.value as 'any' | 'image' | 'pdf',
                  )
                }
              >
                <option value="any">any</option>
                <option value="image">image (jpeg/png/webp)</option>
                <option value="pdf">pdf</option>
              </select>
            </label>
            <label className={styles.control}>
              maxSizeMb
              <select
                className={styles.selectNative}
                value={String(lab.uploadMaxSizeMb)}
                onChange={(e) => lab.setUploadMaxSizeMb(Number(e.target.value))}
              >
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.uploadMultiple}
                onChange={(e) => lab.setUploadMultiple(e.target.checked)}
              />
              multiple
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.uploadAutoUpload}
                onChange={(e) => lab.setUploadAutoUpload(e.target.checked)}
              />
              autoUpload
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.uploadDisabled}
                onChange={(e) => lab.setUploadDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewFull}`}>
            <Upload
              key={`${lab.uploadAcceptMode}-${lab.uploadMultiple}-${lab.uploadAutoUpload}-${lab.uploadMaxSizeMb}`}
              accept={UPLOAD_ACCEPT_BY_MODE[lab.uploadAcceptMode]}
              maxSizeBytes={lab.uploadMaxSizeMb * 1024 * 1024}
              multiple={lab.uploadMultiple}
              autoUpload={lab.uploadAutoUpload}
              disabled={lab.uploadDisabled}
              onUploaded={(files) =>
                lab.setUploadLastResult(
                  files.map((file) => file.originalName).join(', '),
                )
              }
            />
            {lab.uploadLastResult ? (
              <p className={styles.meta}>last upload: {lab.uploadLastResult}</p>
            ) : (
              <p className={styles.meta}>last upload: (none)</p>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>RichTextEditor</h2>
          <p className={styles.meta}>
            Teams-style toolbar (ticket <code>025</code>). Hotkeys: Ctrl+B / I /
            U, Ctrl+Shift+S, Ctrl+Shift+8 / 7, Ctrl+K. Wired to popup notices (
            <code>026</code>).
          </p>
          <div className={styles.controls}>
            <label className={styles.control}>
              labels
              <select
                className={styles.selectNative}
                value={lab.richTextLabelLocale}
                onChange={(e) =>
                  lab.setRichTextLabelLocale(e.target.value as 'en' | 'de')
                }
              >
                <option value="de">de (Fett, Kursiv, …)</option>
                <option value="en">en</option>
              </select>
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.richTextDisabled}
                onChange={(e) => lab.setRichTextDisabled(e.target.checked)}
              />
              disabled
            </label>
          </div>
          <div className={`${styles.preview} ${styles.previewFull}`}>
            <RichTextEditor
              value={lab.richTextValue}
              onChange={lab.setRichTextValue}
              disabled={lab.richTextDisabled}
              placeholder={
                lab.richTextLabelLocale === 'de'
                  ? 'Nachricht eingeben'
                  : 'Enter message'
              }
              labels={
                lab.richTextLabelLocale === 'de'
                  ? DE_RICH_TEXT_LABELS
                  : DEFAULT_RICH_TEXT_LABELS
              }
            />
          </div>
          <p className={styles.meta}>HTML length: {lab.richTextValue.length}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>SidebarPanelIcon</h2>
          <div className={styles.controls}>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.sidebarCollapsed}
                onChange={(e) => lab.setSidebarCollapsed(e.target.checked)}
              />
              collapsed
            </label>
            <label className={styles.control}>
              <input
                type="checkbox"
                checked={lab.sidebarMirrored}
                onChange={(e) => lab.setSidebarMirrored(e.target.checked)}
              />
              mirrored
            </label>
          </div>
          <div className={styles.preview}>
            <SidebarPanelIcon
              collapsed={lab.sidebarCollapsed}
              mirrored={lab.sidebarMirrored}
            />
          </div>
        </section>
      </div>
    </ToastProvider>
  );
}
