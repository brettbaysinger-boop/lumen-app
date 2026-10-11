import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { authHeaders } from './auth';
import { speechChunks } from './voice';

// Each chunk lives only in the private app cache and is removed after playback.
export async function playReply(text: string, signal: AbortSignal, onEnd: () => void,
  options: { companionId?: string; voice?: string; onStart?: () => void; onError?: (error: Error) => void } = {}): Promise<() => void> {
  const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Voice server address is missing.');
  const chunks = speechChunks(text).filter(value => value.trim());
  if (!chunks.length) throw new Error('Reply text is empty.');
  const controller = new AbortController();
  let finished = false, complete: (() => void) | undefined, release: (() => void) | undefined;
  let lifecycle: { remove(): void } | undefined;
  const stop = () => {
    if (finished) return;
    finished = true; controller.abort(); release?.(); complete?.();
    signal.removeEventListener('abort', stop); lifecycle?.remove(); onEnd();
  };
  signal.addEventListener('abort', stop);
  lifecycle = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
  if (signal.aborted) { stop(); throw new Error('Playback cancelled.'); }
  async function startChunk(text: string) {
    const file = new File(Paths.cache, `raialume-reply-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    let player: ReturnType<typeof createAudioPlayer> | undefined;
    let listener: { remove(): void } | undefined;
    let playbackTimer: ReturnType<typeof setTimeout> | undefined;
    let released = false;
    release = () => {
      if (released) return; released = true;
      if (playbackTimer) clearTimeout(playbackTimer); listener?.remove();
      try { player?.pause(); } catch {}
      try { player?.remove(); } catch {}
      try { if (file.exists) file.delete(); } catch {}
    };
    const requestTimer = setTimeout(() => controller.abort(), 130000);
    let bytes: Uint8Array;
    try {
      const response = await fetch(`${base}/v0.1/voice/speak`, {
        method:'POST', headers:{'Content-Type':'application/json',...await authHeaders()},
        body:JSON.stringify({text,companion_id:options.companionId,voice:options.voice}), signal:controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not create reply audio.');
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (controller.signal.aborted && !finished && !signal.aborted) throw new Error('Reply audio timed out. Try Play again.');
      throw error;
    } finally { clearTimeout(requestTimer); }
    if (finished || signal.aborted) throw new Error('Playback cancelled.');
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('Invalid reply audio.');
    file.create(); file.write(bytes);
    await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false});
    if (finished || signal.aborted) throw new Error('Playback cancelled.');
    player = createAudioPlayer({uri:file.uri});
    const ended = new Promise<void>((resolve,reject) => {
      complete = resolve;
      listener = player!.addListener('playbackStatusUpdate', status => {
        if (status.didJustFinish) { release?.(); resolve(); }
      });
      playbackTimer = setTimeout(() => { release?.(); reject(new Error('Reply audio did not finish. Try Play again.')); },180000);
    });
    void ended.catch(() => {});
    player.play();
    return {ended};
  }
  let first: { ended: Promise<void> };
  try { first = await startChunk(chunks[0]); if (!finished) options.onStart?.(); }
  catch (error) { stop(); throw error; }
  void (async () => {
    try {
      await first.ended;
      for (const chunk of chunks.slice(1)) {
        if (finished) return;
        const next = await startChunk(chunk); await next.ended;
      }
      stop();
    } catch (error) {
      if (!finished) { options.onError?.(error instanceof Error ? error : new Error('Reply playback failed.')); stop(); }
    }
  })();
  return stop;
}
