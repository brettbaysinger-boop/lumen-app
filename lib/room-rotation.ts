// Turning the phone in the Live Room. Phone app only.
//
// The app is portrait everywhere (app.json). The Live Room screen alone lets Android turn it, and
// only while the room is on screen. That needs the native part of expo-screen-orientation, which
// exists only if the protected native project was built with it. Where it is missing this returns
// null and the screen behaves exactly as before: portrait, with the Full screen control in Theater.
//
// Nothing here is imported from the package's JavaScript: the repository's dependencies are
// unchanged, and the one native call used (`lockAsync` with a number) is spelled out below.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// expo-screen-orientation 9.x, OrientationLock: 0 = Android decides, following the phone's own
// auto-rotate setting; 3 = portrait, upright; 5 = landscape, either way round.
export const ROOM_LOCKS = { follow: 0, portrait: 3, landscape: 5 } as const;
export type RoomLock = keyof typeof ROOM_LOCKS;

export interface RoomRotation { set(lock: RoomLock): Promise<boolean> }

/** The means to turn this one screen, or null where the build does not have it. Never throws. */
export function roomRotation(): RoomRotation | null {
  if (Platform.OS !== 'android') return null;
  let native: any = null;
  try { native = requireOptionalNativeModule('ExpoScreenOrientation'); } catch { return null; }
  if (!native || typeof native.lockAsync !== 'function') return null;
  return { set: async lock => { try { await native.lockAsync(ROOM_LOCKS[lock]); return true; } catch { return false; } } };
}

/**
 * What the screen asks of Android. Away from the room (sign-in, a failure, the background, leaving):
 * portrait, like the rest of the app. In the room: follow the phone, which honours the owner's
 * auto-rotate setting. While the keyboard is open the phone is held as it is, so typing is not
 * turned over mid-word.
 */
export function roomLock(roomShown: boolean, keyboardOpen: boolean, landscape: boolean): RoomLock {
  if (!roomShown) return 'portrait';
  if (keyboardOpen) return landscape ? 'landscape' : 'portrait';
  return 'follow';
}
