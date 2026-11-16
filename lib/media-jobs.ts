import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { authHeaders } from './auth';
import { getPrivacyMode } from './privacy-mode';

/** A background video job as the backend reports it. Heavy's addresses are never included. */
export interface MediaJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  mode: 't2v' | 'i2v' | 't2i2v';
  duration_seconds: number;
  result_path: string | null;
  result_mime_type: string | null;
  error: string | null;
  message_id: string | null;
}

export interface MessageMediaJob {
  id: string;
  status: MediaJob['status'];
  error?: string;
}

export function readMediaJob(metadata: Record<string, unknown> | null | undefined): MessageMediaJob | null {
  const job = metadata?.media_job as Record<string, unknown> | undefined;
  if (!job || typeof job.id !== 'string' || typeof job.status !== 'string') return null;
  return { id: job.id, status: job.status as MediaJob['status'], error: typeof job.error === 'string' ? job.error : undefined };
}

export function jobFinished(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

export async function fetchMediaJob(id: string): Promise<MediaJob | null> {
  const baseUrl = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  // Generation history is Private-only; the backend refuses Public requests as well.
  if (!baseUrl || getPrivacyMode() !== 'private') return null;
  const response = await fetch(`${baseUrl}/v0.3/media/jobs/${encodeURIComponent(id)}?privacy_mode=private`, {
    headers: await authHeaders(),
  });
  if (!response.ok) return null;
  return (await response.json()) as MediaJob;
}

/**
 * How long to wait before the next look at an unfinished job. A render can take hours on Heavy,
 * so polling starts quick and backs off: every 4 s for the first 2 minutes, every 15 s until
 * 10 minutes, then every 30 s. The job itself is followed by the server's video worker either way.
 */
export function mediaJobPollDelay(elapsedMs: number): number {
  if (elapsedMs < 2 * 60_000) return 4_000;
  if (elapsedMs < 10 * 60_000) return 15_000;
  return 30_000;
}

/** Poll an unfinished job until it completes or fails; paused while the app is in the background
 * (or the browser tab is hidden), and checked again at once when it comes back. */
export function useMediaJob(initial: MessageMediaJob | null): MediaJob | null {
  const [job, setJob] = useState<MediaJob | null>(null);
  const id = initial && !jobFinished(initial.status) ? initial.id : null;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!cancelled && !done && AppState.currentState !== 'background') {
        timer = setTimeout(poll, mediaJobPollDelay(Date.now() - started));
      }
    };
    const poll = async () => {
      try {
        const next = await fetchMediaJob(id);
        if (cancelled) return;
        if (next) setJob(next);
        if (next && jobFinished(next.status)) { done = true; return; }
      } catch {
        // Network blips are retried on the next tick.
      }
      schedule();
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled && !done) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        void poll();
      } else if (state === 'background' && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    });
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); subscription.remove(); };
  }, [id]);
  return job;
}
