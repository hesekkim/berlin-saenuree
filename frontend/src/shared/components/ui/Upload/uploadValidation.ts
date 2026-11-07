export type UploadValidationErrorCode =
  | 'type_not_allowed'
  | 'size_exceeded';

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; code: UploadValidationErrorCode };

function normalizeAcceptTokens(accept?: string): string[] {
  if (!accept || accept.trim() === '*') {
    return [];
  }
  return accept
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((token) => token.length > 0 && token !== '*');
}

function contentTypeMatchesToken(contentType: string, token: string): boolean {
  const normalized = (contentType || 'application/octet-stream').toLowerCase();
  if (token.endsWith('/*')) {
    return normalized.startsWith(token.slice(0, -1));
  }
  return normalized === token;
}

export function fileMatchesAccept(file: File, accept?: string): boolean {
  const tokens = normalizeAcceptTokens(accept);
  if (tokens.length === 0) {
    return true;
  }

  const mimeTokens = tokens.filter((token) => !token.startsWith('.'));
  const extensionTokens = tokens.filter((token) => token.startsWith('.'));
  const name = file.name.toLowerCase();

  const mimeOk = mimeTokens.some((token) =>
    contentTypeMatchesToken(file.type, token)
  );
  const extOk = extensionTokens.some((token) => name.endsWith(token));

  if (mimeTokens.length > 0 && extensionTokens.length > 0) {
    return mimeOk || extOk;
  }
  if (mimeTokens.length > 0) {
    return mimeOk;
  }
  return extOk;
}

export function validateUploadFile(
  file: File,
  options: { accept?: string; maxSizeBytes?: number } = {}
): UploadValidationResult {
  if (!fileMatchesAccept(file, options.accept)) {
    return { ok: false, code: 'type_not_allowed' };
  }
  if (
    options.maxSizeBytes != null &&
    options.maxSizeBytes > 0 &&
    file.size > options.maxSizeBytes
  ) {
    return { ok: false, code: 'size_exceeded' };
  }
  return { ok: true };
}

const MIME_DISPLAY_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'image/svg+xml': 'SVG',
  'image/*': 'Images',
  'application/pdf': 'PDF',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/csv': 'CSV',
};

/** Human-readable accept tokens for UI (e.g. JPEG, PNG, PDF). */
export function formatAcceptLabels(accept?: string): string[] {
  const tokens = normalizeAcceptTokens(accept);
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    let label: string;
    if (token.startsWith('.')) {
      label = token.slice(1).toUpperCase();
    } else if (MIME_DISPLAY_LABELS[token]) {
      label = MIME_DISPLAY_LABELS[token];
    } else if (token.endsWith('/*')) {
      label = `${token.slice(0, -2).toUpperCase()}s`;
    } else {
      const subtype = token.split('/')[1] ?? token;
      label = subtype.replace(/\+xml$/i, '').toUpperCase();
    }
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}

/** Readable size for a single file row (e.g. 512 B, 1.4 KB, 2.0 MB). */
export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact size for constraint row (e.g. 10MB, 512KB). */
export function formatMaxSizeLabel(maxSizeBytes?: number): string | null {
  if (maxSizeBytes == null || maxSizeBytes <= 0) {
    return null;
  }
  const mb = 1024 * 1024;
  const kb = 1024;
  if (maxSizeBytes % mb === 0) {
    return `${maxSizeBytes / mb}MB`;
  }
  if (maxSizeBytes % kb === 0) {
    return `${maxSizeBytes / kb}KB`;
  }
  return `${maxSizeBytes}B`;
}
