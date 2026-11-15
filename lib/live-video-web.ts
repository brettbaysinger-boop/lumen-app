// Live video from the phone app: a doorway to the web app, not a second video engine.
//
// The animated companion (and Wide Theater) run in the browser over WebRTC. The native
// app has no such engine, so it keeps the portrait and Helios voice, and offers a clearly
// labelled action that opens the signed-in web app in the phone's own browser.
// Nothing is handed over: no token, cookie or account detail is put in the address. The
// browser keeps its own Lumen sign-in, separate from the app's.
import { Linking } from 'react-native';
import { authHeaders } from './auth';

/**
 * Address of the Lumen web app, or null when it is not known for certain.
 * `explicit` (EXPO_PUBLIC_LUMEN_WEB_URL) wins. Without it, the address is taken from the API
 * address only in the documented private HTTPS layout, where the API is the web host on port 8444.
 * Only a plain https origin is accepted: no sign-in details, no path, query or fragment.
 */
export function lumenWebUrl(explicit: string | undefined, apiUrl: string | undefined): string | null {
  const origin = (value: string | undefined): URL | null => {
    const text = value?.trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
      return url;
    } catch { return null; }
  };
  if (explicit?.trim()) {
    const url = origin(explicit);
    return url && (url.pathname === '/' || url.pathname === '') ? `https://${url.host}/` : null;
  }
  const api = origin(apiUrl);
  return api && api.port === '8444' ? `https://${api.hostname}/` : null;
}

export function liveVideoWebUrl(): string | null {
  return lumenWebUrl(process.env.EXPO_PUBLIC_LUMEN_WEB_URL, process.env.EXPO_PUBLIC_LUMEN_API_URL);
}

export type LiveVideoStatus = 'available' | 'unavailable' | 'unknown';
const STATUS_TIMEOUT_MS = 8_000;

/**
 * Asked each time the action is used, never remembered: the avatar service is stopped and started
 * while the app is open (for example while its graphics card does other work).
 * 'unavailable' is the server's own answer; 'unknown' means the server could not be asked.
 */
export async function liveVideoStatus(): Promise<LiveVideoStatus> {
  const api = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!api) return 'unknown';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${api}/v0.1/avatar/status`, { headers: await authHeaders(), signal: controller.signal });
    if (!response.ok) return 'unknown';
    const body = await response.json();
    return body?.enabled === true && body?.available === true ? 'available' : 'unavailable';
  } catch { return 'unknown'; } finally { clearTimeout(timer); }
}

export type LiveVideoChoice = 'cancel' | 'retry' | 'open';
const OWN_SIGN_IN = 'The browser keeps its own Lumen sign-in, so sign in there the first time. This app stays as it is, with the portrait and voice.';

/** What to tell the person, and what they may choose, before anything is opened. */
export function liveVideoPrompt(url: string | null, status: LiveVideoStatus): { title: string; message: string; choices: LiveVideoChoice[] } {
  if (!url) return { title: 'Live video is not set up in this app', message: 'This build does not know the address of the Lumen web app, so it cannot open live video. Everything else in the app works as before.', choices: ['cancel'] };
  if (status === 'available') return { title: 'Open live video in your browser?', message: `Live video and Wide Theater run in the Lumen web app. This opens it in your browser. ${OWN_SIGN_IN}`, choices: ['cancel', 'open'] };
  if (status === 'unavailable') return { title: 'Video currently unavailable', message: `Lumen's video service is not running right now. It is sometimes stopped while its computer does other work. You can check again, or open the web app anyway: it shows the portrait until video is back. ${OWN_SIGN_IN}`, choices: ['cancel', 'retry', 'open'] };
  return { title: 'Could not check live video', message: `This app could not reach Lumen to ask whether video is running. You can check again, or open the web app anyway. ${OWN_SIGN_IN}`, choices: ['cancel', 'retry', 'open'] };
}

/** Opens the web app in the phone's browser. Returns false when no browser could open it. */
export async function openLiveVideoOnWeb(url: string): Promise<boolean> {
  if (lumenWebUrl(url, undefined) !== url) return false;
  try { await Linking.openURL(url); return true; } catch { return false; }
}
