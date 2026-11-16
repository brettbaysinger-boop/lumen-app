// Turning the phone in the Live Room. Phone app only.
//
// The app is portrait everywhere. The Live Room screen alone lets Android turn it, and only while
// the room itself is on screen. This uses what the app's navigation already has: a screen of the
// native stack (react-native-screens, in the build since before the first APK) can state its own
// orientation and hide the system bars while it is the screen in front. No new native module.
//
// One consequence of that mechanism: once any screen states an orientation, a screen that states
// none is left free to turn. So the root layout states portrait for every screen, and this screen
// alone overrides it.

/** What the screen asks of Android, as a native-stack `orientation` value. */
export type RoomLock = 'default' | 'portrait_up' | 'landscape';
/** Every other screen of the app, stated in the root layout. */
export const APP_ORIENTATION: RoomLock = 'portrait_up';

/**
 * Away from the room (sign-in, a failure, the background, leaving): portrait, like the rest of the
 * app. In the room: 'default', which lets Android decide and so honours the owner's auto-rotate
 * setting. While the keyboard is open the phone is held as it is, so typing is not turned over
 * mid-word. `settle` holds portrait for one moment after the page's own full screen ends, because
 * the web view puts portrait back by itself then and the rule has to be stated afresh to count.
 */
export function roomLock(roomShown: boolean, keyboardOpen: boolean, landscape: boolean, settle = false): RoomLock {
  if (!roomShown || settle) return 'portrait_up';
  if (keyboardOpen) return landscape ? 'landscape' : 'portrait_up';
  return 'default';
}

/** Sideways in the room the picture gets the whole screen: status and navigation bars hidden (a swipe from the edge shows them briefly). */
export function roomImmersive(roomShown: boolean, landscape: boolean): boolean {
  return roomShown && landscape;
}
