/** Host part before path/query (no credentials). */
function hostCandidateFromInput(trimmed: string): string {
  const withoutProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, '')
    : trimmed;
  const authority = withoutProtocol.split(/[/?#]/)[0] ?? '';
  const afterAt = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  if (afterAt.startsWith('[')) {
    const end = afterAt.indexOf(']');
    return end >= 0 ? afterAt.slice(1, end) : afterAt;
  }
  return afterAt.split(':')[0] ?? '';
}

function isAcceptableHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) {
    return false;
  }
  if (normalized === 'localhost') {
    return true;
  }

  // Bare digits like "123" — URL maps them to 0.0.0.123.
  if (/^\d+$/.test(normalized)) {
    return false;
  }

  // Explicit IPv4 only when the user typed all four octets.
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    return normalized.split('.').every((part) => {
      const value = Number(part);
      return (
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 255 &&
        String(value) === part
      );
    });
  }

  // Domain requires a dot and a letter TLD (min 2 chars).
  if (!normalized.includes('.')) {
    return false;
  }

  const labels = normalized.split('.');
  if (labels.some((label) => !label || label.length > 63)) {
    return false;
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]{2,}$/i.test(tld)) {
    if (!(tld.startsWith('xn--') && tld.length > 4)) {
      return false;
    }
  }

  return labels.every((label) =>
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|xn--[a-z0-9-]+)$/i.test(label)
  );
}

/** Returns a normalized http(s) URL, or null when invalid. */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'https://' || trimmed === 'http://') {
    return null;
  }

  const hostCandidate = hostCandidateFromInput(trimmed);
  if (!isAcceptableHost(hostCandidate)) {
    return null;
  }

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!isAcceptableHost(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidLinkUrl(raw: string): boolean {
  return normalizeLinkUrl(raw) !== null;
}
