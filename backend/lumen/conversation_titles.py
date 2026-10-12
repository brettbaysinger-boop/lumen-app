"""Useful first-message titles without overwriting custom names."""
import logging
import re


def opening_title(text):
    text = re.sub(r'\s+', ' ', text or '').strip()
    text = re.sub(r'^(?:please\s+)?(?:can|could|would) you\s+', '', text, flags=re.I)
    if not text or text.lower().strip('.!?') in {
        'hi', 'hello', 'hey', 'good morning', 'good evening',
    }:
        return None
    first = re.split(r'[.!?](?:\s|$)', text, maxsplit=1)[0].strip()
    words = first.split()
    title = ' '.join(words[:8])
    if len(title) > 60:
        shortened = title[:60]
        title = shortened.rsplit(' ', 1)[0] or shortened
    return title or None


async def name_first_turn(db, companion_id, conversation, text, recent):
    if not isinstance(conversation, dict) or recent:
        return conversation
    previous = conversation.get('title')
    if previous not in {'New Conversation', 'New conversation', 'New Chat', 'New chat'}:
        return conversation
    title = opening_title(text)
    if not title:
        return conversation
    try:
        rows = await db._request(
            'PATCH', 'conversations',
            params={'id': f"eq.{conversation['id']}",
                    'companion_id': f'eq.{companion_id}',
                    'title': f'eq.{previous}'},
            headers={'Prefer': 'return=representation'},
            json={'title': title},
        )
        if rows and len(rows) == 1 and rows[0].get('id') == conversation['id']:
            return rows[0]
    except Exception:
        logging.getLogger(__name__).warning('Automatic chat naming unavailable')
    return conversation
