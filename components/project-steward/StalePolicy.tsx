import { createContext, useContext } from 'react';
import { STALE_AFTER_MS } from '@/lib/project-steward/status';

/** Staleness window for everything on screen: server-declared (v1.1) or the default. */
const StalePolicy = createContext<number>(STALE_AFTER_MS);

export const StalePolicyProvider = StalePolicy.Provider;

export function useStaleAfterMs(): number {
  return useContext(StalePolicy);
}
