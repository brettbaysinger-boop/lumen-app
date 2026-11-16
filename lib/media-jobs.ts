import { useEffect, useState } from 'react';
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

/** Poll an unfinished job every few seconds until it completes or fails. */
export function useMediaJob(initial: MessageMediaJob | null): MediaJob | null {
  const [job, setJob] = useState<MediaJob | null>(null);
  const id = initial && !jobFinished(initial.status) ? initial.id : null;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await fetchMediaJob(id);
        if (cancelled) return;
        if (next) setJob(next);
        if (next && jobFinished(next.status)) return;
      } catch {
        // Network blips are retried on the next tick.
      }
      if (!cancelled) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id]);
  return job;
}
