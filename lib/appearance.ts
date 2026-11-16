import { getThemeColors, type ExtendedThemeColors, type SchemeId } from './theme';

export type PortraitFrame = 'circle' | 'oval' | 'rounded' | 'none';
export type FrameFinish = 'gold' | 'silver' | 'accent';
export interface Appearance {
  background: string;
  text: string;
  accent: string;
  frame: PortraitFrame;
  finish: FrameFinish;
  motion: boolean;
  portraitOpacity: number;
}
export const DEFAULT_APPEARANCE: Appearance = { background: '', text: '', accent: '', frame: 'rounded', finish: 'gold', motion: true, portraitOpacity: 0.92 };
export const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export function mix(a: string, b: string, weight: number) {
  const values = [1, 3, 5].map(offset => Math.round(parseInt(a.slice(offset, offset + 2), 16) * (1 - weight) + parseInt(b.slice(offset, offset + 2), 16) * weight));
  return '#' + values.map(v => v.toString(16).padStart(2, '0')).join('');
}
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function appearanceColors(scheme: SchemeId, prefs: Appearance): ExtendedThemeColors {
  const base = getThemeColors(scheme);
  const background = isHex(prefs.background) ? prefs.background : base.neutral[950];
  const text = isHex(prefs.text) ? prefs.text : base.neutral[100];
  const neutral = prefs.background || prefs.text ? {
    ...base.neutral, 50: text, 100: text, 200: mix(background, text, .92), 300: mix(background, text, .8),
    400: mix(background, text, .72), 500: mix(background, text, .65), 600: mix(background, text, .6),
    700: mix(background, text, .2), 800: mix(background, text, .12), 900: mix(background, text, .06), 950: background,
  } : base.neutral;
  const primary = isHex(prefs.accent) ? {
    ...base.primary, 200: prefs.accent, 300: prefs.accent, 400: prefs.accent,
    500: mix(prefs.accent, '#000000', .25), 600: mix(prefs.accent, '#000000', .55),
    700: mix(prefs.accent, '#000000', .65), 800: mix(prefs.accent, '#000000', .75), 900: mix(prefs.accent, '#000000', .85),
  } : base.primary;
  return { ...base, neutral, primary };
}
export function readAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? value as Partial<Appearance> : {};
  return {
    background: isHex(input.background || '') ? input.background! : '', text: isHex(input.text || '') ? input.text! : '', accent: isHex(input.accent || '') ? input.accent! : '',
    frame: ['circle', 'oval', 'rounded', 'none'].includes(input.frame || '') ? input.frame! : 'rounded',
    finish: ['gold', 'silver', 'accent'].includes(input.finish || '') ? input.finish! : 'gold',
    motion: typeof input.motion === 'boolean' ? input.motion : true,
    portraitOpacity: typeof input.portraitOpacity === 'number' && Number.isFinite(input.portraitOpacity) ? Math.max(.5, Math.min(1, input.portraitOpacity)) : .92,
  };
}

// --- The phone app's appearance, handed to its own Live Room view (Android S22 fix) ---------------
// The room inside the phone app used to find its colours on its own, through a second sign-in in
// the web view and the account's saved copy. Whenever that copy was missing, stale or unreadable
// ("Not saved" in Settings → Appearance) the room fell back to other colours than the app around it.
// Now the app states the colours it is showing, before the page starts, and the room shows exactly
// those. Display only: nothing is saved, and no other page or browser tab is affected.
export const ROOM_APPEARANCE_GLOBAL = '__lumenRoomAppearance';
export type RoomAppearance = { schemeId: string; appearance: Appearance };

/** App side: one line that leaves the colours where the room can read them. Data is validated JSON only. */
export function roomAppearanceScript(schemeId: string, appearance: Appearance): string {
  const value = JSON.stringify({ schemeId: String(schemeId).slice(0, 40), appearance: readAppearance(appearance) });
  // JSON is a valid JS expression; '<' is escaped so nothing in it can end a script element.
  return `window.${ROOM_APPEARANCE_GLOBAL}=${value.replace(/</g, '\\u003c')};true;`;
}

/** Page side: what the phone app stated, or null in an ordinary browser or with anything malformed. */
export function readRoomAppearance(source: unknown): RoomAppearance | null {
  if (!source || typeof source !== 'object') return null;
  const value = source as Record<string, unknown>;
  if (typeof value.schemeId !== 'string' || !value.appearance || typeof value.appearance !== 'object') return null;
  return { schemeId: value.schemeId, appearance: readAppearance(value.appearance) };
}
