"""Grounded confirmation of a single changed personal fact, without model write authority."""
import re
from .memory_corrections import (
    CorrectionPlan, validated_replacement, _attribute, _action, _reply, _UNCERTAIN, _NEGATIVE,
)

YES = re.compile(r"(?:yes|yeah|yep|please do|go ahead|update it|yes[, ]+please|yes[, ]+update it|yes[, ]+please update it|yes[, ]+do that)[.!]*", re.I)
NO = re.compile(r"(?:no|no thanks|cancel|never mind|nevermind|don't update it|do not update it)[.!]*", re.I)


def bare_fact(text, name='Lumen'):
    text = re.sub(r'^' + re.escape(name) + r'[,\s]+', '', text.strip(), flags=re.I)
    if not 1 <= len(text) <= 500 or '?' in text or _UNCERTAIN.search(text) or _NEGATIVE.search(text):
        return None
    if not re.match(r'^(?:my\s+|i\s+)', text, re.I) or not _attribute(text):
        return None
    # Reuse the strict single-assertion validation, including clause/ownership checks.
    p = CorrectionPlan(action='correction', assertion=text, unambiguous=True)
    return text if validated_replacement(p, text, {'content': text}, []) else None


async def active_user_memories(db, cid):
    return await db._request('GET', 'memories', params={
        'companion_id': f'eq.{cid}', 'subject': 'eq.user', 'is_active': 'eq.true',
        'select': 'id,content,subject,is_active,revision_version,tags',
        'order': 'importance.desc,updated_at.desc,id.asc', 'limit': '501'})


def matching(rows, fact):
    return [m for m in rows if m.get('subject') == 'user' and m.get('is_active') is True
            and _attribute(m.get('content', '')) == _attribute(fact)]


def duplicates(rows, target):
    topics = {t for t in (target.get('tags') or []) if isinstance(t, str) and t.startswith('topic:')}
    return any(m['id'] != target['id'] and (
        _attribute(m.get('content', '')) == _attribute(target['content'])
        or topics.intersection(m.get('tags') or [])) for m in rows)


async def natural_memory_update(db, cid, conversation_id, message, recent, memories,
                                request_id, companion_name='Lumen'):
    text = re.sub(r'^' + re.escape(companion_name) + r'[,\s]+', '', message.strip(), flags=re.I)
    last = recent[0] if recent and recent[0].get('role') == 'assistant' else {}
    metadata = last.get('metadata') or {}
    pending = metadata.get('memory_update_proposal')
    if pending and NO.fullmatch(text):
        return _action("Okay—I haven’t changed that saved memory.")
    if YES.fullmatch(text) and (pending or metadata.get('memory_revision') or 'update it' in text.casefold()):
        return await confirm_update(db, cid, conversation_id, message, recent, pending, request_id, companion_name)
    fact = bare_fact(message, companion_name)
    # Avoid a new database query for ordinary statements unrelated to loaded memories.
    if not fact or not any(m.get('subject') == 'user' and _attribute(m.get('content', '')) == _attribute(fact) for m in memories):
        return None
    try:
        rows = await active_user_memories(db, cid)
    except Exception:
        return _action("I couldn’t check that against your saved preferences. I haven’t changed a memory.")
    if len(rows) > 500:
        return _action("Please review that fact in Memories; I couldn’t check all possible matches.")
    targets = matching(rows, fact)
    if not targets:
        return None
    if len(targets) != 1 or duplicates(rows, targets[0]):
        return _action("I found more than one saved memory for that fact. Please review them in Memories before replacing one.")
    target = targets[0]
    if target['content'].casefold().rstrip('.!') == fact.casefold().rstrip('.!'):
        return None
    if type(target.get('revision_version')) is not int:
        return _action("I couldn’t verify the saved version. Please review it in Memories.")
    # No write and no automatic observation: the proposal is persisted with the assistant message.
    result = _action('I have “' + target['content'] + '” saved. Replace it with “' + fact
                     + '”? You can say “yes, update it” or “no”.')
    result['memory_update_proposal'] = {
        'memory_id': target['id'], 'version': target['revision_version'],
        'before': target['content'], 'after': fact, 'source_text': message,
    }
    return result


async def confirm_update(db, cid, conversation_id, message, recent, pending, request_id, companion_name):
    params = {'companion_id': f'eq.{cid}', 'request_id': f'eq.{request_id}', 'limit': '1'}
    try:
        receipt = await db._request('GET', 'memory_revisions', params=params)
        if receipt:
            r = receipt[0]
            suffix = '\nConfirmation: ' + message
            if r.get('conversation_id') != conversation_id or not r.get('source_text', '').endswith(suffix):
                return _action('This request conflicts with an earlier correction. Please send it again.')
            return _reply(r, replay=True)
    except Exception:
        return _action("I couldn’t check that correction. I haven’t tried to change the memory.")
    if not isinstance(pending, dict):
        return _action("Which saved fact should I update, and what should it say? I haven’t changed anything.")
    # Only the immediately preceding user assertion may be confirmed.
    source = recent[1] if len(recent) > 1 else {}
    if (source.get('role') != 'user' or not pending.get('source_message_id')
            or source.get('id') != pending['source_message_id']
            or source.get('content') != pending.get('source_text')):
        return _action("That proposal is no longer current. Please tell me the fact you want changed.")
    fact = bare_fact(source['content'], companion_name)
    if not fact or fact != pending.get('after') or type(pending.get('version')) is not int:
        return _action("I couldn’t verify that proposed replacement. Please state the correction again.")
    try:
        rows = await active_user_memories(db, cid)
        targets = matching(rows, fact)
        if len(rows) > 500 or len(targets) != 1 or duplicates(rows, targets[0]):
            return _action("The saved facts have changed or have multiple matches. Please review them in Memories.")
        target = targets[0]
        if (target['id'] != pending.get('memory_id') or target['content'] != pending.get('before')
                or target.get('revision_version') != pending['version']):
            return _action("That memory changed since I asked. Please review its current value before correcting it.")
    except Exception:
        return _action("I couldn’t check the current memory. I haven’t tried to change it.")
    source_text = 'User statement: ' + source['content'] + '\nConfirmation: ' + message
    try:
        r = await db._request('POST', 'rpc/correct_user_memory', json={
            'p_companion': cid, 'p_conversation': conversation_id, 'p_request': request_id,
            'p_memory': target['id'], 'p_version': pending['version'],
            'p_before': pending['before'], 'p_after': fact, 'p_kind': 'correction',
            'p_source': source_text})
        if not isinstance(r, dict) or not r.get('id'):
            raise ValueError('Unconfirmed correction')
        return _reply(r)
    except Exception:
        try:
            receipts = await db._request('GET', 'memory_revisions', params=params)
            if receipts and receipts[0].get('conversation_id') == conversation_id and receipts[0].get('source_text') == source_text:
                return _reply(receipts[0], replay=True)
        except Exception:
            pass
        return _action("I couldn’t confirm the update. Please check Memories before retrying.")
