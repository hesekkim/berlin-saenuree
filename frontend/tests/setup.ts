import '@testing-library/jest-dom/vitest';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

const localStorage = createLocalStorage();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorage,
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorage,
});
