import { playReply } from './voice';

export async function previewVoice(companionId: string, name: string, voice: string | undefined,
  signal: AbortSignal, onEnd: () => void): Promise<() => void> {
  return playReply(`Hello, I'm ${name.trim() || 'your companion'}. It's good to be here with you.`, signal, onEnd, { companionId, voice });
}
