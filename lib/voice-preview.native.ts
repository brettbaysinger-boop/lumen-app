import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { authHeaders } from './auth';

// Speech stays private: authenticated POST, temporary app-cache file, no public URL.
export async function previewVoice(companionId: string, name: string, voice: string | undefined,
  signal: AbortSignal, onEnd: () => void): Promise<() => void> {
  const url = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('Voice server address is missing.');
  const controller = new AbortController();
  const file = new File(Paths.cache, `raialume-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  let player: ReturnType<typeof createAudioPlayer> | undefined;
  let listener: { remove(): void } | undefined;
  let lifecycle: { remove(): void } | undefined;
  let finished = false;
  const stop = () => {
    if (finished) return;
    finished = true; controller.abort(); clearTimeout(timer);
    signal.removeEventListener('abort', stop); listener?.remove(); lifecycle?.remove();
    player?.pause(); player?.remove();
    try { if (file.exists) file.delete(); } catch {}
    onEnd();
  };
  const timer = setTimeout(stop, 130_000);
  signal.addEventListener('abort', stop);
  lifecycle = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
  try {
    if (signal.aborted) throw new Error('Voice preview cancelled.');
    const response = await fetch(`${url}/v0.1/voice/speak`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders() },
      body: JSON.stringify({ text: `Hello, I'm ${name.trim() || 'your companion'}. It's good to be here with you.`, companion_id: companionId, voice }),
      signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not create the voice sample.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (finished || signal.aborted) throw new Error('Voice preview cancelled.');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Invalid voice sample.');
    file.create();
    file.write(bytes);
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
    if (finished || signal.aborted) throw new Error('Voice preview cancelled.');
    player = createAudioPlayer({ uri: file.uri });
    listener = player.addListener('playbackStatusUpdate', status => { if (status.didJustFinish) stop(); });
    player.play();
    return stop;
  } catch (error) { stop(); throw error; }
}
