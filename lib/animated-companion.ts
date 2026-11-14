// Animated Companion mode, browser side. Optional and web only.
//
// The companion's video and lip-synced speech come from the avatar service over
// WebRTC. Lumen's API relays the session setup after checking the signed-in user
// and companion; the app never contacts the avatar service's own HTTP routes.
// The reply text and its Helios speech are still produced by Lumen exactly as
// before: this module only hands the audio the app already has to the avatar.
import { authHeaders } from './auth';
import { playThroughAvatar, playbackEvent, wavMilliseconds, type AvatarLink, type AvatarPlayback, type PlaybackEvent } from './animated-companion-core';

export type AnimatedState = 'off' | 'connecting' | 'ready';
const CONNECT_TIMEOUT_MS = 15_000;

function apiUrl(): string {
  const url = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
  if (!url) throw new Error('Set EXPO_PUBLIC_LUMEN_API_URL, then restart Expo.');
  return url;
}

export function animatedCompanionSupported(): boolean {
  return typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
    && (typeof AudioContext !== 'undefined');
}

/** Whether the server offers the mode and the avatar service is reachable right now. */
export async function animatedCompanionAvailable(signal?: AbortSignal): Promise<boolean> {
  if (!animatedCompanionSupported()) return false;
  try {
    const response = await fetch(`${apiUrl()}/v0.1/avatar/status`, { headers: await authHeaders(), signal });
    const body = response.ok ? await response.json() : null;
    return body?.enabled === true && body?.available === true;
  } catch { return false; }
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function gatheringComplete(connection: RTCPeerConnection, timeout: number): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); connection.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (connection.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, timeout);
    connection.addEventListener('icegatheringstatechange', check);
  });
}

export class AnimatedCompanionSession {
  state: AnimatedState = 'off';
  private connection: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private placeholders: { audio: AudioContext; tracks: MediaStreamTrack[] } | null = null;
  private remote: MediaStream | null = null;
  private element: HTMLVideoElement | null = null;
  private audible = false;
  private listeners = new Set<{ event: (event: PlaybackEvent) => void; closed: () => void }>();
  private attempt = 0;

  constructor(private onChange: (state: AnimatedState) => void) {}

  private change(state: AnimatedState) {
    if (this.state === state) return;
    this.state = state;
    this.onChange(state);
  }

  /** Show the avatar in this element. Its sound stays muted unless the avatar is speaking a reply. */
  attach(element: HTMLVideoElement | null) {
    if (this.element && this.element !== element) this.element.srcObject = null;
    this.element = element;
    if (!element) return;
    element.muted = !this.audible;
    element.srcObject = this.remote;
    if (this.remote) void element.play().catch(() => {});
  }

  async connect(companionId: string): Promise<boolean> {
    this.close();
    if (!animatedCompanionSupported()) return false;
    const attempt = ++this.attempt;
    this.change('connecting');
    try {
      const connection = new RTCPeerConnection();
      this.connection = connection;
      // OpenAvatarChat's RTC client sends its tracks in answer to tracks it receives,
      // so the app offers a silent audio track and a blank video track. No microphone
      // or camera is used and no permission prompt appears.
      const audio = new AudioContext();
      const silent = audio.createMediaStreamDestination();
      const canvas = document.createElement('canvas');
      canvas.width = 16; canvas.height = 16;
      canvas.getContext('2d')?.fillRect(0, 0, 16, 16);
      const blank = canvas.captureStream(1);
      const tracks = [...silent.stream.getAudioTracks(), ...blank.getVideoTracks()];
      this.placeholders = { audio, tracks };
      connection.addTrack(tracks[0], silent.stream);
      connection.addTrack(tracks[1], blank);

      const remote = new MediaStream();
      this.remote = remote;
      connection.ontrack = event => {
        remote.addTrack(event.track);
        if (this.element) { this.element.srcObject = remote; void this.element.play().catch(() => {}); }
      };
      const channel = connection.createDataChannel('chat');
      this.channel = channel;
      channel.onmessage = message => {
        const event = playbackEvent(message.data);
        if (event) for (const listener of [...this.listeners]) listener.event(event);
      };
      const lost = () => { if (this.connection === connection) this.close(); };
      channel.onclose = lost;
      connection.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) lost();
      };

      await connection.setLocalDescription(await connection.createOffer());
      await gatheringComplete(connection, 3_000);
      const response = await fetch(`${apiUrl()}/v0.1/avatar/offer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeaders() },
        body: JSON.stringify({ companion_id: companionId, webrtc_id: randomId(), type: 'offer', sdp: connection.localDescription?.sdp }),
      });
      if (!response.ok) throw new Error('offer refused');
      const answer = await response.json();
      if (attempt !== this.attempt || this.connection !== connection) return false;
      await connection.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT_MS);
        const check = () => {
          if (this.connection !== connection) { clearTimeout(timer); reject(new Error('closed')); }
          else if (channel.readyState === 'open' && remote.getVideoTracks().length) { clearTimeout(timer); resolve(); }
          else setTimeout(check, 100);
        };
        check();
      });
      if (attempt !== this.attempt) return false;
      this.change('ready');
      return true;
    } catch {
      if (attempt === this.attempt) this.close();
      return false;
    }
  }

  close() {
    this.attempt++;
    const connection = this.connection;
    this.connection = null;
    for (const listener of [...this.listeners]) listener.closed();
    this.listeners.clear();
    this.audible = false;
    if (this.element) { this.element.muted = true; this.element.srcObject = null; }
    try { this.channel?.close(); } catch {}
    this.channel = null;
    this.placeholders?.tracks.forEach(track => track.stop());
    void this.placeholders?.audio.close().catch(() => {});
    this.placeholders = null;
    this.remote?.getTracks().forEach(track => track.stop());
    this.remote = null;
    try { connection?.close(); } catch {}
    this.change('off');
  }

  private link(): AvatarLink {
    return {
      send: message => {
        if (this.channel?.readyState !== 'open') return false;
        try { this.channel.send(message); return true; } catch { return false; }
      },
      listen: (event, closed) => {
        const listener = { event, closed };
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
      },
      upload: async (audio, signal) => {
        const response = await fetch(`${apiUrl()}/v0.1/avatar/speech`, {
          method: 'POST', headers: { 'Content-Type': 'audio/wav', ...await authHeaders() }, body: audio, signal,
        });
        const body = response.ok ? await response.json() : null;
        if (typeof body?.ticket !== 'string') throw new Error('no ticket');
        return body.ticket;
      },
      setAudible: audible => {
        this.audible = audible;
        if (this.element) {
          this.element.muted = !audible;
          if (audible) void this.element.play().catch(() => {});
        }
      },
      duration: async audio => wavMilliseconds(await audio.arrayBuffer()),
    };
  }

  /** Reply-audio player for playReply. Returns null whenever the avatar cannot speak this audio. */
  player = async (audio: Blob, signal: AbortSignal): Promise<AvatarPlayback | null> => {
    if (this.state !== 'ready' || !this.element) return null;
    return playThroughAvatar(this.link(), audio, signal);
  };
}
