import { useEffect, useState } from 'react';
import type { ButtonVariant } from '../../shared/components/ui/Button/Button';
import type { StatusTagVariant } from '../../shared/components/ui/StatusTag/StatusTag';

export function useUiLab() {
  const [buttonVariant, setButtonVariant] = useState<ButtonVariant>('primary');
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [buttonFullWidth, setButtonFullWidth] = useState(false);
  const [buttonClicks, setButtonClicks] = useState(0);

  const [inputValue, setInputValue] = useState('Sample text');
  const [inputError, setInputError] = useState(false);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [inputMultiline, setInputMultiline] = useState(false);
  const [inputClearable, setInputClearable] = useState(true);

  const [selectValue, setSelectValue] = useState('azure');
  const [selectError, setSelectError] = useState(false);
  const [selectDisabled, setSelectDisabled] = useState(false);

  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [checkboxDisabled, setCheckboxDisabled] = useState(false);

  const [toggleChecked, setToggleChecked] = useState(false);
  const [toggleDisabled, setToggleDisabled] = useState(false);

  const [tagSelected, setTagSelected] = useState(false);
  const [tagDisabled, setTagDisabled] = useState(false);

  const [statusVariant, setStatusVariant] =
    useState<StatusTagVariant>('answered');

  const [ratingValue, setRatingValue] = useState('gut');

  const [tocActive, setTocActive] = useState(true);
  const [tocDisabled, setTocDisabled] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMirrored, setSidebarMirrored] = useState(false);

  const [uploadAcceptMode, setUploadAcceptMode] = useState<
    'any' | 'image' | 'pdf'
  >('any');
  const [uploadMultiple, setUploadMultiple] = useState(false);
  const [uploadDisabled, setUploadDisabled] = useState(false);
  const [uploadAutoUpload, setUploadAutoUpload] = useState(true);
  const [uploadMaxSizeMb, setUploadMaxSizeMb] = useState(5);
  const [uploadLastResult, setUploadLastResult] = useState<string>('');
  const [hasAuthToken, setHasAuthToken] = useState(false);

  const [richTextValue, setRichTextValue] = useState(
    '<p>Nachricht eingeben — try <strong>Fett</strong>, <em>Kursiv</em>, lists, color, size, link.</p>',
  );
  const [richTextDisabled, setRichTextDisabled] = useState(false);
  const [richTextLabelLocale, setRichTextLabelLocale] = useState<'en' | 'de'>(
    'de',
  );
  const [richTextExValue, setRichTextExValue] = useState(
    '<p>Select text to add a link, or insert an image/file at the cursor.</p>',
  );
  const [richTextExDisabled, setRichTextExDisabled] = useState(false);

  useEffect(() => {
    const syncAuth = () => {
      setHasAuthToken(Boolean(localStorage.getItem('auth_token')));
    };
    syncAuth();
    window.addEventListener('focus', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('focus', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  return {
    buttonVariant,
    setButtonVariant,
    buttonDisabled,
    setButtonDisabled,
    buttonFullWidth,
    setButtonFullWidth,
    buttonClicks,
    setButtonClicks,

    inputValue,
    setInputValue,
    inputError,
    setInputError,
    inputDisabled,
    setInputDisabled,
    inputMultiline,
    setInputMultiline,
    inputClearable,
    setInputClearable,

    selectValue,
    setSelectValue,
    selectError,
    setSelectError,
    selectDisabled,
    setSelectDisabled,

    checkboxChecked,
    setCheckboxChecked,
    checkboxDisabled,
    setCheckboxDisabled,

    toggleChecked,
    setToggleChecked,
    toggleDisabled,
    setToggleDisabled,

    tagSelected,
    setTagSelected,
    tagDisabled,
    setTagDisabled,

    statusVariant,
    setStatusVariant,

    ratingValue,
    setRatingValue,

    tocActive,
    setTocActive,
    tocDisabled,
    setTocDisabled,

    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarMirrored,
    setSidebarMirrored,

    uploadAcceptMode,
    setUploadAcceptMode,
    uploadMultiple,
    setUploadMultiple,
    uploadDisabled,
    setUploadDisabled,
    uploadAutoUpload,
    setUploadAutoUpload,
    uploadMaxSizeMb,
    setUploadMaxSizeMb,
    uploadLastResult,
    setUploadLastResult,
    hasAuthToken,

    richTextValue,
    setRichTextValue,
    richTextDisabled,
    setRichTextDisabled,
    richTextLabelLocale,
    setRichTextLabelLocale,
    richTextExValue,
    setRichTextExValue,
    richTextExDisabled,
    setRichTextExDisabled,
  };
}
