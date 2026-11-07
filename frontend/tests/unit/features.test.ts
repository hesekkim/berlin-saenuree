import { describe, expect, it } from 'vitest';
import { isEnvFlagEnabled } from '../../src/shared/config/features';

describe('isEnvFlagEnabled', () => {
  it('is true only for the string true (case-insensitive)', () => {
    expect(isEnvFlagEnabled('true')).toBe(true);
    expect(isEnvFlagEnabled('TRUE')).toBe(true);
    expect(isEnvFlagEnabled(' True ')).toBe(true);
  });

  it('defaults to false for unset or other values', () => {
    expect(isEnvFlagEnabled(undefined)).toBe(false);
    expect(isEnvFlagEnabled('')).toBe(false);
    expect(isEnvFlagEnabled('false')).toBe(false);
    expect(isEnvFlagEnabled('1')).toBe(false);
  });
});
