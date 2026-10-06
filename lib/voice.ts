import { authHeaders } from './auth';

// Browser audio is used only on Expo web; native clients get an explicit message.
export interface RecordingHandle { stop(): void; cancel(): void }

function browserAudio() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Voice is currently available in the browser app.');
  }
}

async function voiceRequest(path: string, init: RequestInit, signal?: AbortSignal) {
  const url = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('Set EXPO_PUBLIC_LUMEN_API_URL, then restart Expo.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 130_000);
  try {
    const response = await fetch(`${url}/v0.1/voice/${path}`, { ...init, headers: { ...init.headers, ...await authHeaders() }, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === 'string' ? body.detail : `Voice request failed (${response.status}).`);
    }
    // Read the body within the timeout and cancellation scope.
    return path === 'transcribe' || path.endsWith('/voices') || path.endsWith('/voice') ? await response.json() : await response.blob();
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Voice request timed out.');
    if (err instanceof TypeError) throw new Error('Could not reach Lumen for voice. Check the API connection.');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function transcribeRecording(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (!blob.size) throw new Error('No audio was recorded. Try again.');
  const form = new FormData();
  form.append('file', blob, 'recording');
  const result = await voiceRequest('transcribe', { method: 'POST', body: form }, signal);
  if (!result || typeof result.text !== 'string') throw new Error('Invalid transcript from Helios.');
  if (!result.text.trim()) throw new Error('No speech detected. Try again.');
  return result.text.trim();
}

export async function recordMicrophone(
  onRecording: (blob: Blob) => void,
  onError: (error: Error) => void,
): Promise<RecordingHandle> {
  browserAudio();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Open Lumen at http://localhost:8081 or HTTPS to use the microphone.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder: MediaRecorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(type => MediaRecorder.isTypeSupported(type));
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach(track => track.stop());
    throw err;
  }
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const chunks: Blob[] = [];
  const cleanup = () => { clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); };
  const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); cleanup(); };
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    cleanup();
    if (!cancelled) onRecording(new Blob(chunks, { type: recorder.mimeType }));
  };
  recorder.onerror = () => {
    cancelled = true;
    stop();
    onError(new Error('Microphone recording failed. Try again.'));
  };
  try { recorder.start(); } catch (err) { cleanup(); throw err; }
  timer = setTimeout(stop, 60_000);
  return { stop, cancel: () => { cancelled = true; stop(); } };
}

export function speechChunks(text: string, maximum = 500): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maximum) {
    const sample = remaining.slice(0, maximum);
    const boundary = Math.max(sample.lastIndexOf('. '), sample.lastIndexOf('! '), sample.lastIndexOf('? '), sample.lastIndexOf('\n'));
    const space = sample.lastIndexOf(' ');
    let end = boundary >= maximum / 2 ? boundary + 1 : space >= maximum / 2 ? space + 1 : maximum;
    // Keep surrogate pairs together at a hard boundary.
    if (end === maximum && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function playReply(text: string, signal: AbortSignal, onEnd: () => void, options: { companionId?: string; voice?: string; onStart?: () => void; onError?: (error: Error) => void } = {}): Promise<() => void> {
  browserAudio();
  const chunks = speechChunks(text).filter(chunk => chunk.trim());
  if (!chunks.length) throw new Error('Reply text is empty.');
  const controller = new AbortController();
  let release: (() => void) | undefined;
  let completeChunk: (() => void) | undefined;
  let finished = false;
  const stop = () => {
    if (finished) return;
    finished = true;
    controller.abort(); release?.(); completeChunk?.();
    signal.removeEventListener('abort', stop);
    onEnd();
  };
  signal.addEventListener('abort', stop);
  if (signal.aborted) { stop(); throw new Error('Playback cancelled.'); }
  async function startChunk(chunk: string): Promise<{ ended: Promise<void> }> {
    const blob = await voiceRequest('speak', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunk, companion_id: options.companionId, voice: options.voice }),
    }, controller.signal) as Blob;
    if (finished) throw new Error('Playback cancelled.');
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    let released = false;
    release = () => { if (released) return; released = true; audio.pause(); audio.removeAttribute('src'); URL.revokeObjectURL(objectUrl); };
    const ended = new Promise<void>((resolve, reject) => {
      completeChunk = resolve;
      audio.onended = () => { release?.(); resolve(); };
      audio.onerror = () => { release?.(); reject(new Error('Speech playback failed before this reply finished.')); };
    });
    // Attach a handler before play(), which can fail before the queue starts waiting.
    void ended.catch(() => {});
    try { await audio.play(); } catch {
      release();
      throw new Error('Could not play the audio. Check browser sound permissions and try Play again.');
    }
    if (finished) { release(); throw new Error('Playback cancelled.'); }
    return { ended };
  }
  let first: { ended: Promise<void> };
  try { first = await startChunk(chunks[0]); options.onStart?.(); } catch (err) { stop(); throw err; }
  void (async () => {
    try {
      await first.ended;
      for (const chunk of chunks.slice(1)) {
        if (finished) return;
        const next = await startChunk(chunk); await next.ended;
      }
      stop();
    } catch (err) {
      if (!finished) { options.onError?.(err instanceof Error ? err : new Error('Speech failed.')); stop(); }
    }
  })();
  return stop;
}


export interface VoiceOption { id: string; name: string; language?: string; gender?: string }
export interface VoiceOptions { voices: VoiceOption[]; selected: string | null; effective: string; model: string }
export async function getVoiceOptions(companionId: string, signal?: AbortSignal): Promise<VoiceOptions> {
  return await voiceRequest(`companions/${encodeURIComponent(companionId)}/voices`, { method: 'GET' }, signal) as VoiceOptions;
}
export async function chooseVoice(companionId: string, voice: string | null, signal?: AbortSignal): Promise<{ selected: string | null; effective: string }> {
  return await voiceRequest(`companions/${encodeURIComponent(companionId)}/voice`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice }) }, signal) as { selected: string | null; effective: string };
}
