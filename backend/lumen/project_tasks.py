"""Explicit project steps and grounded conversational follow-ups."""
import json
import re
from datetime import datetime, timedelta, timezone


def task_request(text, recent):
    direct = re.fullmatch(
        r'add (?:tasks|steps) to (?:the )?project (.{1,300}?)\s*:\s*(.+)',
        text.strip(), re.I | re.S,
    )
    if direct:
        parts = [part.strip() for part in re.split(r';|\n', direct[2]) if part.strip()]
        return {'title': direct[1].strip(), 'tasks': parts}

    followup = re.fullmatch(
        r'(?:sure[, ]+)?add (?:those|these|the) (two|2|three|3|four|4|five|5) tasks'
        r'(?:\s+(?:then|and) add (?:it |them )?to my day)?[.!]*',
        text.strip(), re.I,
    )
    if not followup:
        return None
    clarify = {
        'content': 'Which saved project and tasks should I use? Try '
        '“add tasks to project Copper Garden: Identify weed types; Gather supplies”. '
        'Nothing has been changed.',
        'item': None,
    }
    if not recent or recent[0].get('role') != 'assistant':
        return {'clarify': clarify['content']}
    proposal = recent[0].get('content', '')
    tasks = re.findall(r'^\s*\d+[.)]\s+(.+)$', proposal, re.M)
    count = {'two': 2, 'three': 3, 'four': 4, 'five': 5}.get(followup[1].lower())
    count = count or int(followup[1])
    if len(tasks) != count:
        return {'clarify': clarify['content']}

    # Resolve a backend save receipt, never a model's claim of creation.
    for message in recent[:10]:
        item = (message.get('metadata') or {}).get('my_day_item')
        if not isinstance(item, dict) or item.get('kind') != 'project':
            continue
        title = item.get('title')
        if not isinstance(title, str) or not title.strip() or not item.get('id'):
            return {'clarify': clarify['content']}
        try:
            stamp = datetime.fromisoformat(str(message['created_at']).replace('Z', '+00:00'))
            age = datetime.now(timezone.utc) - stamp
            if stamp.tzinfo is None or age < timedelta(0) or age > timedelta(minutes=30):
                return {'clarify': clarify['content']}
        except (KeyError, ValueError, TypeError):
            return {'clarify': clarify['content']}
        if not re.search(r'(?<!\w)' + re.escape(title) + r'(?!\w)', proposal, re.I):
            return {'clarify': clarify['content']}
        return {
            'id': item['id'], 'title': title,
            'tasks': [re.sub(r'\*\*|__', '', part).strip() for part in tasks],
        }
    return {'clarify': clarify['content']}


async def capture_project_tasks(db, companion_id, text, recent, command=None):
    if command is None:
        command = task_request(text, recent or [])
    if command is None:
        return None
    if 'clarify' in command:
        return {'content': command['clarify'], 'item': None}
    tasks = command['tasks']
    if not 1 <= len(tasks) <= 20 or any(not part or len(part) > 300 for part in tasks):
        return {
            'content': 'Use one to twenty steps, each at most 300 characters, '
            'separated by semicolons. Nothing has been changed.',
            'item': None,
        }
    failure = {
        'content': 'I couldn’t confirm the project update. Check My Day before retrying. '
        'Nothing else has been created.',
        'item': None,
    }
    try:
        params = {
            'companion_id': f'eq.{companion_id}', 'kind': 'eq.project',
            'status': 'eq.open', 'limit': '501',
        }
        if command.get('id'):
            params['id'] = f"eq.{command['id']}"
        rows = await db._request('GET', 'my_day_items', params=params)
        matches = [
            row for row in rows
            if row.get('title', '').casefold() == command['title'].casefold()
        ]
        if len(rows) >= 501 or len(matches) != 1:
            return {
                'content': 'I need one matching open project. Check My Day and use '
                'its exact name; rename duplicates first. Nothing has been changed.',
                'item': None,
            }
        item = matches[0]
        if (item.get('companion_id') != companion_id or
                item.get('kind') != 'project' or item.get('status') != 'open'):
            return failure
        original = item.get('checklist')
        if not isinstance(original, list):
            return failure
        updated = list(original)
        existing = {step['text'].strip().casefold() for step in original}
        added = []
        for task in tasks:
            if task.casefold() not in existing:
                updated.append({'text': task, 'done': False})
                added.append(task)
                existing.add(task.casefold())
        if len(updated) > 100:
            return {
                'content': 'That project would exceed 100 steps. Shorten the list '
                'in My Day first. Nothing has been changed.',
                'item': None,
            }
        if added:
            # Refuse an update if another client changed the checklist after our read.
            saved = await db._request(
                'PATCH', 'my_day_items',
                params={
                    'id': f"eq.{item['id']}", 'companion_id': f'eq.{companion_id}',
                    'kind': 'eq.project', 'status': 'eq.open',
                    'checklist': 'eq.' + json.dumps(original, separators=(',', ':')),
                },
                headers={'Prefer': 'return=representation'},
                json={'checklist': updated},
            )
            if len(saved or []) != 1:
                return failure
            item = saved[0]
            if (item.get('checklist') != updated or
                    item.get('id') != matches[0]['id'] or
                    item.get('companion_id') != companion_id):
                return failure
        content = (
            f"Saved {len(added)} project steps to {item['title']} in My Day."
            if added else
            f"Those steps are already in {item['title']} in My Day. No duplicates added."
        )
        return {'content': content, 'item': item}
    except Exception:
        return failure
