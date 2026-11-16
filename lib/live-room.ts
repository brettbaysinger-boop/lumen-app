// The Live Room: one web layout of the chat screen, made for the phone app's in-app view.
//
// It is the same screen, the same avatar session and the same <video> element as the ordinary
// chat. A static word in the address (?room=live) asks for it; nothing else is carried there.
// Two views share it: Video Chat (compact video, conversation, message box) and Companion
// Theater (the video as large as the space allows). Switching views only changes layout.
//
// The page and the phone app exchange a handful of fixed words, listed below, and nothing else:
// no sign-in detail, no conversation text, no address.
import { useSyncExternalStore } from 'react';

export type RoomMode = 'chat' | 'theater';
export const ROOM_PARAM = 'room';
const STORE_KEY = 'lumen.room';

/** Whether the address asks for the Live Room. `stored` is what this tab remembered earlier. */
export function roomRequested(search: string | null | undefined, stored: string | null | undefined): boolean {
  let asked: string | null = null;
  try { asked = new URLSearchParams(search ?? '').get(ROOM_PARAM); } catch {}
  if (asked === 'live') return true;
  if (asked !== null) return false;            // any other value, such as ?room=off, leaves the room
  return stored === 'live';
}

let room: boolean | null = null;
/**
 * True when this tab was opened as the Live Room. Decided once, when the page loads, and kept for
 * the life of the tab, so signing in or visiting Documents does not drop back to the full website.
 */
export function isLiveRoom(): boolean {
  if (room !== null) return room;
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return false;
  let stored: string | null = null;
  try { stored = window.sessionStorage.getItem(STORE_KEY); } catch {}
  room = roomRequested(window.location.search, stored);
  try { if (room) window.sessionStorage.setItem(STORE_KEY, 'live'); else window.sessionStorage.removeItem(STORE_KEY); } catch {}
  return room;
}

// --- Which of the two views is showing. Kept outside React so the tab layout can follow it too. ---
let mode: RoomMode = 'chat';
const watchers = new Set<() => void>();
export function getRoomMode(): RoomMode { return mode; }
export function setRoomMode(next: RoomMode): void {
  if (next === mode) return;
  mode = next;
  for (const watcher of [...watchers]) watcher();
}
function watchRoomMode(watcher: () => void): () => void { watchers.add(watcher); return () => { watchers.delete(watcher); }; }
export function useRoomMode(): RoomMode { return useSyncExternalStore(watchRoomMode, getRoomMode, getRoomMode); }

// --- Words between the page and the phone app ---------------------------------------------------
// ready/gone: the room's own header is (not) on screen, so the app hides (shows) its bar.
// chat/theater: the view now showing. close/browser: the person tapped that control in the room.
// restored: the page's own full screen has just ended.
// private/public: the person flipped the 🔒 Private | 👥 Public switch in the room (Issue #39).
export const ROOM_EVENTS = ['ready', 'gone', 'chat', 'theater', 'close', 'browser', 'restored', 'private', 'public'] as const;
export type RoomEvent = typeof ROOM_EVENTS[number];

/** True when the page is running inside the phone app's own view. */
export function roomEmbedded(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ReactNativeWebView?.postMessage === 'function';
}

/** Page side: tell the phone app one of the fixed words. Does nothing in an ordinary browser. */
export function postRoomEvent(event: RoomEvent): void {
  if (!roomEmbedded()) return;
  try { (window as any).ReactNativeWebView.postMessage(JSON.stringify({ lumenRoom: 1, event })); } catch {}
}

/** App side: read one of the fixed words. Anything else a page posts is ignored. */
export function readRoomEvent(data: unknown): RoomEvent | null {
  if (typeof data !== 'string' || data.length > 100) return null;
  let message: any;
  try { message = JSON.parse(data); } catch { return null; }
  if (!message || typeof message !== 'object' || message.lumenRoom !== 1) return null;
  return (ROOM_EVENTS as readonly string[]).includes(message.event) ? message.event as RoomEvent : null;
}

// The one thing the app ever says to the page: "Android Back was pressed in Theater".
// A fixed line with no data in it. The page answers by returning to Video Chat.
export const ROOM_BACK_EVENT = 'lumenroomback';
export const ROOM_BACK_SCRIPT = `window.dispatchEvent(new Event('${ROOM_BACK_EVENT}'));true;`;

// Two more fixed lines from the app: the phone is now held
// sideways, or upright again. Decided by the app, never by the page: a portrait window with the
// keyboard open is also wider than it is tall, and that must not count as turning the phone.
export const ROOM_LANDSCAPE_EVENT = 'lumenroomlandscape';
export const ROOM_PORTRAIT_EVENT = 'lumenroomportrait';
export const ROOM_LANDSCAPE_SCRIPT = `window.dispatchEvent(new Event('${ROOM_LANDSCAPE_EVENT}'));true;`;
export const ROOM_PORTRAIT_SCRIPT = `window.dispatchEvent(new Event('${ROOM_PORTRAIT_EVENT}'));true;`;

export type RoomView = { mode: RoomMode; messages: boolean };
/**
 * Turning the phone sideways shows Theater by itself; turning it upright puts back exactly what was
 * showing before. `saved` is that earlier view while the phone is sideways, else null.
 * Without live video there is no Theater, so nothing changes until the video is ready.
 */
export function turnRoom(sideways: boolean, videoReady: boolean, now: RoomView, saved: RoomView | null): { now: RoomView; saved: RoomView | null } {
  if (sideways && videoReady && !saved) return { now: { mode: 'theater', messages: false }, saved: now };
  if (!sideways && saved) return { now: saved, saved: null };
  return { now, saved };
}

// --- Size of the video in the room: always the whole 3:2 frame, never cropped or stretched ---------
export const ROOM_ASPECT = 3 / 2;
export const VIDEO_CHAT_SHARE = 0.38;   // of the window height, at most; it shrinks with the keyboard
const SMALLEST_HEIGHT = 80;

/**
 * Video Chat: `availableHeight` is the window height and the video takes at most 38% of it.
 * Theater: `availableHeight` is the height of the space itself and the video fills what fits.
 * The height is an even number of pixels, so the width is exactly one and a half times it.
 */
export function liveRoomBox(view: RoomMode, availableWidth: number, availableHeight: number): { width: number; height: number } {
  const limit = view === 'chat' ? availableHeight * VIDEO_CHAT_SHARE : availableHeight;
  const fits = Math.min(limit, availableWidth / ROOM_ASPECT);
  // Video Chat keeps a smallest useful picture; Theater never grows past its space.
  const floor = view === 'chat' ? Math.min(SMALLEST_HEIGHT, availableWidth / ROOM_ASPECT) : 0;
  const height = Math.max(0, Math.floor(Math.max(floor, fits) / 2) * 2);
  return { width: height * ROOM_ASPECT, height };
}
