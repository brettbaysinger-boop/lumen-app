// Animated Companion mode: protocol and playback logic with no browser APIs,
// so it can be tested directly. The browser session lives in animated-companion.ts.
//
// The avatar service is OpenAvatarChat. The app talks to it over that project's
// existing chat data channel: SendHumanText carries a one-time speech ticket,
// Interrupt stops speech, and ChatSignal reports when playback begins and ends.

export const START_TIMEOUT_MS = 8_000;
export const END_GRACE_MS = 15_000;
export const MAX_SPEECH_MS = 180_000;
export const TAIL_MS = 350;

export type PlaybackEvent = 'begin' | 'end';

export interface AvatarPlayback { ended: Promise<void>; release: () => void }

export interface AvatarLink {
  /** Send one message on the avatar data channel. Returns false if it is closed. */
  send(message: string): boolean;
  /** Subscribe to playback events and disconnection. Returns an unsubscribe function. */
  listen(onEvent: (event: PlaybackEvent) => void, onClosed: () => void): () => void;
  /** Hand the speech audio to Lumen and get its one-time ticket. */
  upload(audio: Blob, signal: AbortSignal): Promise<string>;
  /** Unmute or mute the avatar's audio track. It is muted unless the avatar is the one speaking. */
  setAudible(audible: boolean): void;
  /** Length of the audio in milliseconds when it can be read from the file, else null. */
  duration(audio: Blob): Promise<number | null>;
}

export function speechTicketMessage(ticket: string): string {
  return JSON.stringify({ header: { name: 'SendHumanText' }, payload: { text: JSON.stringify({ lumen_speech: ticket }) } });
}

export function interruptMessage(): string {
  return JSON.stringify({ header: { name: 'Interrupt' } });
}

export function playbackEvent(raw: unknown): PlaybackEvent | null {
  if (typeof raw !== 'string') return null;
  let message: any;
  try { message = JSON.parse(raw); } catch { return null; }
  if (message?.header?.name !== 'ChatSignal' || message?.payload?.stream_type !== 'client_playback') return null;
  const type = message.payload.type;
  return type === 'stream_begin' ? 'begin' : type === 'stream_end' || type === 'stream_cancel' ? 'end' : null;
}

/** Milliseconds of audio in a WAV file, or null when the header does not say. */
export function wavMilliseconds(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes);
  const tag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (view.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const name = tag(offset), size = view.getUint32(offset + 4, true);
    if (name === 'fmt ' && offset + 20 <= view.byteLength) byteRate = view.getUint32(offset + 16, true);
    if (name === 'data') {
      if (!byteRate) return null;
      // A streamed file may declare a placeholder size; trust the bytes that are there.
      const length = Math.min(size, view.byteLength - offset - 8);
      return Math.round(length / byteRate * 1000);
    }
    offset += 8 + size + (size & 1);
  }
  return null;
}

/**
 * Speak one piece of reply audio through the avatar.
 *
 * Resolves with a playback handle once the avatar has actually begun speaking.
 * Resolves with null when it cannot, in which case the caller plays the same
 * audio itself. The avatar's audio track stays muted in that case and the
 * avatar is told to stop, so the reply is never heard twice.
 */
export async function playThroughAvatar(link: AvatarLink, audio: Blob, signal: AbortSignal): Promise<AvatarPlayback | null> {
  if (signal.aborted) return null;
  let stopListening = () => {};
  let finish: () => void = () => {};
  let settled = false;
  const giveUp = () => { stopListening(); link.setAudible(false); link.send(interruptMessage()); return null; };
  let ticket: string;
  let length: number | null;
  try {
    [ticket, length] = await Promise.all([link.upload(audio, signal), link.duration(audio).catch(() => null)]);
  } catch { return null; }
  if (signal.aborted) return null;

  const started = new Promise<boolean>(resolve => {
    const settle = (value: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value); };
    const timer = setTimeout(() => settle(false), START_TIMEOUT_MS);
    const abort = () => settle(false);
    signal.addEventListener('abort', abort);
    stopListening = link.listen(event => {
      if (event === 'begin') settle(true);
      else if (settled) finish();
    }, () => { settle(false); if (settled) finish(); });
    if (!link.send(speechTicketMessage(ticket))) settle(false);
  });
  if (!await started || signal.aborted) return giveUp();

  settled = true;
  link.setAudible(true);
  let done = false;
  let tail: ReturnType<typeof setTimeout> | undefined;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let resolveEnded: () => void = () => {};
  const ended = new Promise<void>(resolve => { resolveEnded = resolve; });
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(limit); clearTimeout(tail);
    stopListening(); link.setAudible(false); resolveEnded();
  };
  // The end signal arrives slightly before the last audio has been heard.
  finish = () => { if (!done && !tail) tail = setTimeout(close, TAIL_MS); };
  limit = setTimeout(close, length === null ? MAX_SPEECH_MS : Math.min(MAX_SPEECH_MS, length + END_GRACE_MS));
  return { ended, release: () => { if (!done) link.send(interruptMessage()); close(); } };
}
