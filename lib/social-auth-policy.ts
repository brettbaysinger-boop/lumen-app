export type SocialProvider = { id: 'google' | 'x' | 'github' | 'apple' | 'azure' | 'facebook'; label: string };
export const socialProviders: SocialProvider[] = [
  { id: 'google', label: 'Google' }, { id: 'x', label: 'X' }, { id: 'apple', label: 'Apple' },
  { id: 'github', label: 'GitHub' }, { id: 'azure', label: 'Microsoft' }, { id: 'facebook', label: 'Facebook' },
];
export function enabledSocialProviders(settings: { external?: Record<string, unknown> }): SocialProvider[] {
  return socialProviders.filter(provider => settings?.external?.[provider.id] === true);
}
export function socialRedirect(location: string): string {
  const url = new URL(location);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported browser address.');
  // Fixed same-origin destination. Never trust a next/redirect URL from query input.
  return `${url.origin}/login`;
}
export function callbackError(location: string): string {
  const url = new URL(location);
  const hash = new URLSearchParams(url.hash.slice(1));
  return url.searchParams.has('error') || hash.has('error') || hash.has('error_code')
    ? 'Sign-in was canceled or could not be completed. Please try again.' : '';
}
export function nativeSessionTokens(location: string, expected: string): { access_token: string; refresh_token: string } {
  const url = new URL(location), target = new URL(expected);
  if (url.protocol !== target.protocol || url.host !== target.host || url.pathname !== target.pathname || callbackError(location))
    throw new Error('Could not finish sign-in. Please try again.');
  const params = new URLSearchParams(url.hash.slice(1));
  const access_token = params.get('access_token'), refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Could not finish sign-in. Please try again.');
  return { access_token, refresh_token };
}
