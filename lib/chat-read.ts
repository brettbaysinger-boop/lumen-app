// Bound reads so a weak connection can reach a visible retry state.
export async function chatRead<T>(request: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await request(controller.signal); }
  finally { clearTimeout(timer); }
}
