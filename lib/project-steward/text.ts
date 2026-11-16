// Small pure helpers shared by the validators and the UI.

// RFC 3339 date-time (JSON-schema "format": "date-time"), with mandatory offset.
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

export function isDateTime(v: unknown): v is string {
  return typeof v === 'string' && DATE_TIME.test(v) && !Number.isNaN(Date.parse(v));
}

// C0/C1 controls (except tab/newline), zero-width and bidi-override characters.
// These can hide or reorder text ("evil.com" shown as "moc.live"), so they never
// reach the screen or a link.
const UNSAFE_CHARS =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function safeText(s: string): string {
  return s.replace(UNSAFE_CHARS, '');
}

/** Applies safeText to every string in a parsed JSON value (keys untouched). */
export function sanitizeDeep<T>(v: T): T {
  if (typeof v === 'string') return safeText(v) as unknown as T;
  if (Array.isArray(v)) return v.map(sanitizeDeep) as unknown as T;
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = sanitizeDeep(val);
    return out as T;
  }
  return v;
}

/**
 * The only URLs the UI will open: absolute https, a real host, no embedded
 * credentials, no whitespace or control characters, at most 512 chars.
 */
export function isSafeUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 512 || v !== safeText(v) || /\s/.test(v)) return false;
  if (!/^https:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password;
  } catch {
    return false;
  }
}
