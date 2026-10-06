import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { enabledSocialProviders, socialRedirect, callbackError, nativeSessionTokens, type SocialProvider } from './social-auth-policy';

WebBrowser.maybeCompleteAuthSession();
export { type SocialProvider } from './social-auth-policy';
export const initialSocialError = Platform.OS === 'web' && typeof window !== 'undefined'
  ? callbackError(window.location.href) : '';

export async function availableSocialProviders(signal?: AbortSignal): Promise<SocialProvider[]> {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Sign-in options are unavailable.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key }, signal: controller.signal });
    if (!response.ok) throw new Error('Sign-in options are unavailable.');
    return enabledSocialProviders(await response.json());
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function continueWithProvider(provider: SocialProvider, link = false): Promise<void> {
  const available = await availableSocialProviders();
  if (!available.some(item => item.id === provider.id)) throw new Error('This sign-in option is not available yet.');
  const redirectTo = Platform.OS === 'web' ? socialRedirect(window.location.href) : Linking.createURL('login');
  // GoTrue supports modern X as "x". The pinned SDK predates that Provider type,
  // but forwards the runtime string unchanged. Only our fixed, discovered IDs enter here.
  const options = { redirectTo, skipBrowserRedirect: Platform.OS !== 'web',
    ...(provider.id === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) };
  const { data, error } = link
    ? await supabase.auth.linkIdentity({ provider: provider.id as Provider, options })
    : await supabase.auth.signInWithOAuth({ provider: provider.id as Provider, options });
  if (error) throw new Error(link ? 'Could not connect this account. Please try again.' : 'Could not start sign-in. Please try again.');
  if (!data.url) throw new Error('The sign-in service did not provide a redirect.');
  if (Platform.OS !== 'web') {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error('Sign-in canceled.');
    const tokens = nativeSessionTokens(result.url, redirectTo);
    const { error: sessionError } = await supabase.auth.setSession(tokens);
    if (sessionError) throw new Error('Could not finish sign-in. Please try again.');
  }
}
