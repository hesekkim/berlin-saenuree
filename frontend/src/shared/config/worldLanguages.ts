/**
 * ISO 639-1 language catalog for site language selection.
 * `name` is the English name (Select / search); `nativeName` is the endonym.
 */
export type WorldLanguage = {
  code: string;
  name: string;
  nativeName: string;
};

export const WORLD_LANGUAGES: WorldLanguage[] = [
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'azərbaycan' },
  { code: 'be', name: 'Belarusian', nativeName: 'беларуская' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'български' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bs', name: 'Bosnian', nativeName: 'bosanski' },
  { code: 'ca', name: 'Catalan', nativeName: 'català' },
  { code: 'cs', name: 'Czech', nativeName: 'čeština' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  { code: 'da', name: 'Danish', nativeName: 'dansk' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'eo', name: 'Esperanto', nativeName: 'Esperanto' },
  { code: 'es', name: 'Spanish', nativeName: 'español' },
  { code: 'et', name: 'Estonian', nativeName: 'eesti' },
  { code: 'eu', name: 'Basque', nativeName: 'euskara' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'fi', name: 'Finnish', nativeName: 'suomi' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino' },
  { code: 'fr', name: 'French', nativeName: 'français' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'gl', name: 'Galician', nativeName: 'galego' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hr', name: 'Croatian', nativeName: 'hrvatski' },
  { code: 'hu', name: 'Hungarian', nativeName: 'magyar' },
  { code: 'hy', name: 'Armenian', nativeName: 'հայերեն' },
  { code: 'id', name: 'Indonesian', nativeName: 'Indonesia' },
  { code: 'is', name: 'Icelandic', nativeName: 'íslenska' },
  { code: 'it', name: 'Italian', nativeName: 'italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'kk', name: 'Kazakh', nativeName: 'қазақ тілі' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'кыргызча' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'lietuvių' },
  { code: 'lv', name: 'Latvian', nativeName: 'latviešu' },
  { code: 'mk', name: 'Macedonian', nativeName: 'македонски' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mn', name: 'Mongolian', nativeName: 'монгол' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'mt', name: 'Maltese', nativeName: 'Malti' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'no', name: 'Norwegian', nativeName: 'norsk' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polish', nativeName: 'polski' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو' },
  { code: 'pt', name: 'Portuguese', nativeName: 'português' },
  { code: 'ro', name: 'Romanian', nativeName: 'română' },
  { code: 'ru', name: 'Russian', nativeName: 'русский' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'sk', name: 'Slovak', nativeName: 'slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'slovenščina' },
  { code: 'sq', name: 'Albanian', nativeName: 'shqip' },
  { code: 'sr', name: 'Serbian', nativeName: 'српски' },
  { code: 'sv', name: 'Swedish', nativeName: 'svenska' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'uz', name: 'Uzbek', nativeName: 'oʻzbekcha' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
].sort((a, b) => a.name.localeCompare(b.name, 'en'));

const WORLD_LANGUAGE_BY_CODE = Object.fromEntries(
  WORLD_LANGUAGES.map((item) => [item.code, item])
) as Record<string, WorldLanguage>;

export function isWorldLanguageCode(code: string): boolean {
  return code in WORLD_LANGUAGE_BY_CODE;
}

/** English name, e.g. "German". */
export function getWorldLanguageName(code: string): string {
  return WORLD_LANGUAGE_BY_CODE[code]?.name ?? code;
}

/** Native endonym, e.g. "Deutsch". */
export function getWorldLanguageNativeName(code: string): string {
  return WORLD_LANGUAGE_BY_CODE[code]?.nativeName ?? code;
}

/** Select option text: "German (Deutsch)". */
export function getWorldLanguageOptionLabel(code: string): string {
  const item = WORLD_LANGUAGE_BY_CODE[code];
  if (!item) {
    return code;
  }
  if (item.name === item.nativeName) {
    return item.name;
  }
  return `${item.name} (${item.nativeName})`;
}
