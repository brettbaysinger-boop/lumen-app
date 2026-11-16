/** The only source of the authenticated Project Steward API origin. */
export function projectSnapshotUrl(base: string | undefined): string | undefined {
  if (!base?.trim()) return undefined;
  try {
    const raw = base.trim().replace(/\/+$/, '');
    const url = new URL(raw);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.search || url.hash ||
        (url.pathname !== '/' && url.pathname !== '')) return undefined;
    return raw + '/v0.1/project-steward/snapshot/v1.1';
  } catch { return undefined; }
}
