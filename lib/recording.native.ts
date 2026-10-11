import { AppState } from 'react-native';
import { RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { createRecordingOptions } from 'expo-audio/build/utils/options';
import AudioModule from 'expo-audio/build/AudioModule';
import { File } from 'expo-file-system';
import { authHeaders } from './auth';
export interface RecordingHandle { stop(): void; cancel(): void }
export interface NativeRecording { uri: string; dispose(): void }
export async function recordMicrophone(onRecording: (audio: NativeRecording) => void, onError: (error: Error) => void, signal?: AbortSignal): Promise<RecordingHandle> {
  let stage = 'checking microphone permission';
  let cancelled = false, stopping = false, ready = false;
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lifecycle: { remove(): void } | undefined;
  const dispose = () => {
    const uri = recorder?.uri;
    if (uri) { try { const file = new File(uri); if (file.exists) file.delete(); } catch {} }
    try { recorder?.release(); } catch {} recorder = undefined;
  };
  const detach = () => { if (timer) clearTimeout(timer); lifecycle?.remove(); signal?.removeEventListener('abort', cancel); };
  const cancel = () => { cancelled = true; if (ready) void finish(); };
  async function finish() {
    if (stopping) return; stopping = true; detach();
    try {
      await recorder?.stop();
      if (cancelled || signal?.aborted) { dispose(); return; }
      const uri = recorder?.uri;
      if (!uri) throw new Error('No audio was recorded. Try again.');
      onRecording({ uri, dispose });
    } catch (error) { dispose(); if (!cancelled && !signal?.aborted) onError(error instanceof Error ? error : new Error('Recording failed.')); }
    finally { await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
  }
  signal?.addEventListener('abort', cancel, { once: true });
  lifecycle = AppState.addEventListener('change', state => { if (state === 'background' || (ready && state !== 'active')) cancel(); });
  const check = () => { if (cancelled || signal?.aborted || AppState.currentState !== 'active') throw new Error('Recording cancelled.'); };
  try {
    check(); let permission = await getRecordingPermissionsAsync();
    if (!permission.granted) permission = await requestRecordingPermissionsAsync();
    check();
    if (!permission.granted) throw new Error('Microphone permission is needed. Allow it in app settings to record.');
    stage = 'setting microphone audio mode';
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); check();
    stage = 'creating microphone recorder';
    recorder = new AudioModule.AudioRecorder(createRecordingOptions({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 }));
    stage = 'preparing microphone recorder';
    await recorder.prepareToRecordAsync(); check();
    stage = 'starting microphone recorder';
    recorder.record(); ready = true;
    timer = setTimeout(() => void finish(), 300_000);
    return { stop: () => void finish(), cancel };
  } catch (error) {
    detach(); try { await recorder?.stop(); } catch {} dispose();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (cancelled || signal?.aborted) throw error;
    throw new Error(`Microphone failed while ${stage}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
export async function transcribeRecording(audio: NativeRecording, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 130_000);
  try {
    const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
    if (!base) throw new Error('Voice server address is missing.');
    if (controller.signal.aborted) throw new Error('Transcription cancelled.');
    const form = new FormData();
    form.append('file', { uri: audio.uri, name: 'recording.m4a', type: 'audio/mp4' } as unknown as Blob);
    const response = await fetch(`${base}/v0.1/voice/transcribe`, { method: 'POST', headers: await authHeaders(), body: form, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Transcription failed.');
    if (controller.signal.aborted) throw new Error('Transcription cancelled.');
    if (typeof body?.text !== 'string' || !body.text.trim()) throw new Error('No speech detected. Try again.');
    return body.text.trim();
  } catch (error) { if (controller.signal.aborted && !signal?.aborted) throw new Error('Transcription timed out.'); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); audio.dispose(); }
}
