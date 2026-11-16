// Public / Private mode (Issue #39). The owner sets it by hand, on each device.
//
// 🔒 Private: Lumen as always. 👥 Public: people may be nearby, so Lumen stays herself but keeps
// personal things to herself. It never means "on the internet"; nothing about the network changes.
// The app never guesses who is around: no microphone, camera or person detection is involved.
//
// The mode is sent with every chat and voice request as a fixed word. The backend enforces it
// (backend/lumen/privacy_mode.py); this file only remembers the choice and decides what the
// screen shows. It is kept per device in this app's own storage, so a reload keeps it.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postRoomEvent } from './live-room';

export type PrivacyMode = 'private' | 'public';
export const PRIVACY_MODES: readonly PrivacyMode[] = ['private', 'public'];
export const PRIVACY_KEY = 'lumen.privacyMode.v1';

export function parsePrivacyMode(value: unknown): PrivacyMode | null {
  return value === 'private' || value === 'public' ? value : null;
}

interface KeyValueStore { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }

export interface PrivacySnapshot {
  mode: PrivacyMode;
  /** False until the remembered choice has been read. */
  loaded: boolean;
  /** True when Public was remembered from before this page or app load (shown as a notice). */
  restored: boolean;
}

// Until the remembered choice is read, the screen counts as Public, so a reload in Public mode
// never flashes private chat text. With nothing remembered, the mode is Private, as before.
let snapshot: PrivacySnapshot = { mode: 'public', loaded: false, restored: false };
let store: KeyValueStore = AsyncStorage;
let loading: Promise<PrivacyMode> | null = null;
const watchers = new Set<() => void>();

function publish(next: PrivacySnapshot) {
  snapshot = next;
  for (const watcher of [...watchers]) watcher();
}

export function getPrivacySnapshot(): PrivacySnapshot { return snapshot; }
export function getPrivacyMode(): PrivacyMode { return snapshot.mode; }

/** Read the remembered choice once. If storage cannot be read, stay Public until the person chooses. */
export function loadPrivacyMode(): Promise<PrivacyMode> {
  if (snapshot.loaded) return Promise.resolve(snapshot.mode);
  if (loading) return loading;
  loading = (async () => {
    let remembered: PrivacyMode | null = null;
    let readable = true;
    try {
      const raw = await store.getItem(PRIVACY_KEY);
      remembered = parsePrivacyMode(raw);
      if (raw !== null && remembered === null) readable = false;   // something unknown was stored
    } catch { readable = false; }
    if (!snapshot.loaded) {
      const mode: PrivacyMode = remembered ?? (readable ? 'private' : 'public');
      publish({ mode, loaded: true, restored: mode === 'public' });
    }
    return snapshot.mode;
  })();
  return loading;
}

/** The person's choice. Takes effect at once and is remembered on this device. */
export function setPrivacyMode(next: PrivacyMode): void {
  if (!parsePrivacyMode(next)) return;
  if (snapshot.loaded && snapshot.mode === next && !snapshot.restored) return;
  publish({ mode: next, loaded: true, restored: false });
  void store.setItem(PRIVACY_KEY, next).catch(() => {});
}

/**
 * A tap on the switch. Inside the phone app's Live Room the app is told too, so the phone keeps one
 * choice. Only a tap is passed on: a page that has just loaded never overrides the app's choice.
 */
export function choosePrivacyMode(next: PrivacyMode): void {
  if (!parsePrivacyMode(next)) return;
  setPrivacyMode(next);
  postRoomEvent(next);
}

function watch(watcher: () => void) { watchers.add(watcher); return () => { watchers.delete(watcher); }; }

export function usePrivacyMode(): PrivacySnapshot {
  const value = useSyncExternalStore(watch, getPrivacySnapshot, getPrivacySnapshot);
  useEffect(() => { void loadPrivacyMode(); }, []);
  return value;
}

/** What the chat screen may show. In Public mode only messages written in Public mode are shown. */
export function messageVisible(mode: PrivacyMode, message: { metadata?: Record<string, unknown> | null }): boolean {
  return mode === 'private' || message?.metadata?.privacy_mode === 'public';
}

/**
 * Whether the reply on its way must be hidden: it was asked for in Private (or before the mode was
 * known) and the switch now says Public. A turn sent in Public is always shown.
 */
export function turnHidden(now: PrivacyMode, sentIn: PrivacyMode | null): boolean {
  return now === 'public' && sentIn !== 'public';
}

/** Conversation names can say a lot. In Public mode the list shows only a neutral name. */
export function conversationLabel(mode: PrivacyMode, title: string, lastMessageAt?: string | null): string {
  if (mode === 'private') return title;
  const when = lastMessageAt ? new Date(lastMessageAt) : null;
  return when && !Number.isNaN(when.getTime())
    ? `Chat · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Chat';
}

// --- Between the phone app and its Live Room web view: two fixed lines each way, no data. ------
export const PRIVACY_EVENT: Record<PrivacyMode, string> = { private: 'lumenroomprivate', public: 'lumenroompublic' };
export function privacyScript(mode: PrivacyMode): string {
  return `window.dispatchEvent(new Event('${PRIVACY_EVENT[mode]}'));true;`;
}

/** Page side: the phone app says which mode it is in. Returns a function that stops listening. */
export function listenForAppPrivacy(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const toPrivate = () => setPrivacyMode('private');
  const toPublic = () => setPrivacyMode('public');
  window.addEventListener(PRIVACY_EVENT.private, toPrivate);
  window.addEventListener(PRIVACY_EVENT.public, toPublic);
  return () => { window.removeEventListener(PRIVACY_EVENT.private, toPrivate); window.removeEventListener(PRIVACY_EVENT.public, toPublic); };
}

/** For tests only. */
export function resetPrivacyModeForTests(storage: KeyValueStore): void {
  store = storage; loading = null; watchers.clear();
  snapshot = { mode: 'public', loaded: false, restored: false };
}
