import { supabase } from './supabase';

export async function signOutThisBrowser(): Promise<void> {
  // A rejected refresh can prevent the SDK from reaching its normal cleanup.
  // Stop refresh first; hard navigation also discards any pending SDK request.
  if (typeof window === 'undefined') {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return;
  }
  supabase.auth.stopAutoRefresh();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }).catch(() => {}),
      new Promise(resolve => { timer = setTimeout(resolve, 5000); }),
    ]);
  } finally {
    clearTimeout(timer);
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error('Supabase address is missing.');
    const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    // Clear only this app's Auth keys; leave appearance preferences intact.
    for (const suffix of ['', '-code-verifier', '-user']) localStorage.removeItem(key + suffix);
    window.location.replace('/login');
  }
}
