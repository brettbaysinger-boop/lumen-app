import type { Conversation } from '../types/database';
import type { ChatSnapshot } from './chat-cache';

export function chatTitle(text: string): string {
  const title = text.trim();
  if (!title || title.length > 200) throw new Error('Use a chat name between 1 and 200 characters.');
  return title;
}

// A successful server listing is authoritative, including deletions on another device.
export function reconcileChats(snapshot: ChatSnapshot, conversations: Conversation[]): ChatSnapshot {
  const ids = new Set(conversations.map(row => row.id));
  return {
    ...snapshot, conversations,
    messages: Object.fromEntries(Object.entries(snapshot.messages).filter(([id]) => ids.has(id))),
    drafts: Object.fromEntries(Object.entries(snapshot.drafts).filter(([id]) => id === 'new' || ids.has(id))),
  };
}

export function visibleChats(conversations: Conversation[], archived: boolean, query: string, collection: string | null = null): Conversation[] {
  const term = query.trim().toLocaleLowerCase();
  return conversations.filter(row => (row.is_active === false) === archived && row.title.toLocaleLowerCase().includes(term) &&
    (collection === null || (collection === 'unfiled'
      ? !row.collection_id : row.collection_id === collection)));
}
