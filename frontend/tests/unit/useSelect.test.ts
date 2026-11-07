import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelect } from '../../src/shared/components/ui/Select/useSelect';

const OPTIONS = [
  { value: 'azure', label: 'Azure DevOps' },
  { value: 'jira', label: 'Jira' },
];

describe('useSelect', () => {
  it('exposes selected label and placeholder display value', () => {
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSelect({
          options: OPTIONS,
          value,
          onChange: vi.fn(),
          placeholder: 'Please select...',
        }),
      { initialProps: { value: 'azure' } }
    );

    expect(result.current.selectedLabel).toBe('Azure DevOps');
    expect(result.current.displayValue).toBe('Azure DevOps');

    rerender({ value: '' });
    expect(result.current.selectedLabel).toBe('');
    expect(result.current.displayValue).toBe('Please select...');
  });

  it('toggles open state and selects an option', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useSelect({
        options: OPTIONS,
        value: 'azure',
        onChange,
      })
    );

    act(() => {
      result.current.toggleDropdown();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.handleSelectOption(OPTIONS[1]);
    });

    expect(onChange).toHaveBeenCalledWith('jira');
    expect(result.current.isOpen).toBe(false);
  });

  it('does not open when disabled', () => {
    const { result } = renderHook(() =>
      useSelect({
        options: OPTIONS,
        value: 'azure',
        onChange: vi.fn(),
        disabled: true,
      })
    );

    act(() => {
      result.current.toggleDropdown();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('filters options by search query when searchable', () => {
    const { result } = renderHook(() =>
      useSelect({
        options: [
          { value: 'ko', label: 'Korean (한국어)' },
          { value: 'kk', label: 'Kazakh (қазақ тілі)' },
          { value: 'de', label: 'German (Deutsch)' },
        ],
        value: null,
        onChange: vi.fn(),
        searchable: true,
      })
    );

    act(() => {
      result.current.handleQueryChange('k');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.dropdownOptions.map((o) => o.value)).toEqual([
      'ko',
      'kk',
    ]);
  });

  it('moves highlight and selects with keyboard', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useSelect({
        options: OPTIONS,
        value: null,
        onChange,
        searchable: true,
      })
    );

    act(() => {
      result.current.handleSearchFocus();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.highlightedIndex).toBe(0);

    act(() => {
      result.current.handleListKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(result.current.highlightedIndex).toBe(1);

    act(() => {
      result.current.handleListKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(onChange).toHaveBeenCalledWith('jira');
    expect(result.current.isOpen).toBe(false);
  });
});
