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
    const response = await fetch(`${url}/v0.1/voice/${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === 'string' ? body.detail : `Voice request failed (${response.status}).`);
    }
    // Read the body within the timeout and cancellation scope.
    return path === 'transcribe' ? await response.json() : await response.blob();
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

export async function playReply(text: string, signal: AbortSignal, onEnd: () => void): Promise<() => void> {
  browserAudio();
  if (text.length > 4000) throw new Error('This reply is too long to play (maximum 4,000 characters).');
  const blob = await voiceRequest('speak', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  }, signal) as Blob;
  if (signal.aborted) throw new Error('Playback cancelled.');
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  let finished = false;
  const stop = () => {
    if (finished) return;
    finished = true;
    audio.pause();
    audio.removeAttribute('src');
    URL.revokeObjectURL(objectUrl);
    signal.removeEventListener('abort', stop);
    onEnd();
  };
  audio.onended = stop;
  audio.onerror = stop;
  signal.addEventListener('abort', stop);
  try { await audio.play(); } catch (err) {
    stop();
    throw new Error('Could not play the audio. Check browser sound permissions and try Play again.');
  }
  return stop;
}
