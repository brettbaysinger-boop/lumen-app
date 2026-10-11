import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { requestKey } from './my-day';

const TOKEN_KEY = 'raialume-push-native-token';
const DEVICE_KEY = 'raialume-push-installation';
const preference = (owner: string) => `raialume-push-enabled:${owner}`;
let operations: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation); operations = next.catch(() => {}); return next;
}
async function deviceId() {
  let value = await AsyncStorage.getItem(DEVICE_KEY);
  if (!value) { value = requestKey(); await AsyncStorage.setItem(DEVICE_KEY, value); }
  return value;
}
async function request(owner: string, path: string, extra: object = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== owner) throw new Error('Account changed. Reopen notification settings.');
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('API address is missing.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/v0.4/push/${path}`, {
      method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}` },
      body: JSON.stringify({ device_id:await deviceId(), ...extra }), signal:controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not update notifications. Retry when connected.');
    }
    const current = await supabase.auth.getSession();
    if (current.data.session?.user.id !== owner) throw new Error('Account changed. Reopen notification settings.');
  } finally { clearTimeout(timer); }
}
export async function pushEnabled(owner: string) { return Platform.OS === 'android' && await AsyncStorage.getItem(preference(owner)) === 'true'; }
async function register(owner: string, ask: boolean) {
  if (Platform.OS !== 'android') throw new Error('Push is available in the Android preview.');
  await Notifications.setNotificationChannelAsync('raialume-reminders', {
    name:'My Day reminders', importance:Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && ask) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await request(owner, 'disable');
    await AsyncStorage.setItem(preference(owner), 'false');
    throw new Error('Notifications are blocked. Allow them in Android app settings, then enable again.');
  }
  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type !== 'android' || typeof token.data !== 'string') throw new Error('Android push token unavailable.');
  await AsyncStorage.setItem(TOKEN_KEY, token.data);
  await request(owner, 'register', { token:token.data });
}
export function enablePush(owner: string) { return serialized(async () => {
  await register(owner, true); await AsyncStorage.setItem(preference(owner), 'true');
}); }
export function disablePush(owner: string) { return serialized(async () => {
  // Report success only when server revocation is confirmed.
  await request(owner, 'disable'); await AsyncStorage.setItem(preference(owner), 'false');
  await Notifications.dismissAllNotificationsAsync();
}); }
export function refreshPush(owner: string) { return serialized(async () => {
  if (await pushEnabled(owner)) await register(owner, false);
  else if (Platform.OS === 'android') {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await request(owner, 'register', { token, enabled:false });
  }
}); }
export function testPush(owner: string) { return serialized(async () => {
  if (!await pushEnabled(owner)) throw new Error('Enable notifications first.');
  await register(owner, false); await request(owner, 'test');
}); }
export async function revokePushBeforeSignOut() {
  if (Platform.OS !== 'android') return;
  const { data } = await supabase.auth.getSession();
  const owner = data.session?.user.id;
  if (owner) {
    await AsyncStorage.setItem(preference(owner), 'false');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Do not trap offline sign-out behind a stalled native token lookup.
      await Promise.race([
        serialized(() => request(owner, 'disable').catch(() => {})),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}
