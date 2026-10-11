import type { Companion, Conversation, Message, ChatCollection } from '../types/database';

export interface ChatSnapshot {
  collections?: ChatCollection[];
  companion: Companion;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  drafts: Record<string, string>;
  savedAt: string;
}
export interface ChatStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}
const PREFIX = 'raialume-private-chat-v1:';
const MAX_CHARS = 2_000_000;

// Serialize disk operations, including sign-out cleanup, so a late write cannot
// recreate private data after it has been removed. Cache is never server authority.
export class ChatCache {
  private queue: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private blocked = false;
  private latest = new Map<string, ChatSnapshot>();
  private activeUser: string | null = null;
  activate(userId: string): void { this.blocked = false; this.activeUser = userId; }
  constructor(private storage: ChatStorage) {}
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(operation);
    this.queue = next;
    return next;
  }
  async read(userId: string): Promise<ChatSnapshot | null> {
    return this.run(async () => {
      try {
        const raw = await this.storage.getItem(PREFIX + userId);
        if (!raw || raw.length > MAX_CHARS) return null;
        const data = JSON.parse(raw) as ChatSnapshot;
        if (!data?.companion || data.companion.owner_user_id !== userId ||
            !Array.isArray(data.conversations) || !data.messages || !data.drafts) return null;
        const id = data.companion.id;
        if (data.collections !== undefined && (
          !Array.isArray(data.collections) ||
          data.collections.some(c => c.companion_id !== id ||
            typeof c.id !== 'string' || typeof c.name !== 'string')
        )) return null;
        if (data.conversations.some(c => c.companion_id !== id)) return null;
        for (const [conversationId, rows] of Object.entries(data.messages)) {
          if (!data.conversations.some(c => c.id === conversationId) || !Array.isArray(rows) ||
              rows.some(m => m.conversation_id !== conversationId || m.companion_id !== id)) return null;
        }
        if (Object.values(data.drafts).some(d => typeof d !== 'string')) return null;
        return data;
      } catch { return null; }
    });
  }
  write(userId: string, snapshot: ChatSnapshot): Promise<void> {
    const epoch = this.epoch;
    this.latest.set(userId, snapshot);
    return this.run(async () => {
      if (this.latest.get(userId) !== snapshot || this.blocked || (this.activeUser !== null && this.activeUser !== userId) || epoch !== this.epoch || snapshot.companion.owner_user_id !== userId) return;
      const conversations = snapshot.conversations.slice(0, 20);
      const ids = new Set(conversations.map(c => c.id));
      const messages = Object.fromEntries(Object.entries(snapshot.messages)
        .filter(([id]) => ids.has(id)).map(([id, rows]) => [id, rows.slice(-200)]));
      const drafts = Object.fromEntries(Object.entries(snapshot.drafts)
        .filter(([id]) => ids.has(id) || id === 'new').map(([id, text]) => [id, text.slice(0, 64000)]));
      const data = { ...snapshot, conversations, messages, drafts, savedAt: new Date().toISOString() };
      let raw = JSON.stringify(data);
      // Favor drafts and recent conversations when histories contain large metadata.
      for (const id of Object.keys(messages).reverse()) {
        if (raw.length <= MAX_CHARS) break;
        delete messages[id];
        raw = JSON.stringify(data);
      }
      if (raw.length <= MAX_CHARS) await this.storage.setItem(PREFIX + userId, raw);
    });
  }
  clearAll(): Promise<void> {
    this.epoch++;
    this.blocked = true;
    this.activeUser = null;
    this.latest.clear();
    return this.run(async () => {
      for (const key of await this.storage.getAllKeys()) {
        if (key.startsWith(PREFIX)) await this.storage.removeItem(key);
      }
    });
  }
}
