export type ToolId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'divider-1'
  | 'bulletList'
  | 'orderedList'
  | 'divider-2'
  | 'textColor'
  | 'fontSize'
  | 'divider-3'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'divider-4'
  | 'link'
  | 'image'
  | 'attachment';

export const TOOL_ORDER: ToolId[] = [
  'bold',
  'italic',
  'underline',
  'strike',
  'divider-1',
  'bulletList',
  'orderedList',
  'divider-2',
  'textColor',
  'fontSize',
  'divider-3',
  'alignLeft',
  'alignCenter',
  'alignRight',
  'divider-4',
];

export const COLOR_PRESETS = [
  '#424242',
  '#097db7',
  '#e03232',
  '#ee7100',
  '#0f8a0f',
  '#00b7c3',
  '#595959',
  '#ffffff',
] as const;

export function isDivider(id: ToolId): boolean {
  return id.startsWith('divider-');
}

export type TextAlignValue = 'left' | 'center' | 'right';

export type MarkCommandId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'bulletList'
  | 'orderedList';
