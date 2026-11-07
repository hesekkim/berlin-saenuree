/** Feature flags from Vite env. Unset values default to false. */
export function isEnvFlagEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const isUiLabEnabled = isEnvFlagEnabled(
  import.meta.env.VITE_ENABLE_UI_LAB
);
