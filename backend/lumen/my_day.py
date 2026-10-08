"""Owner-scoped daily work, explicit chat actions, and in-app reminder delivery."""
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository

router = APIRouter(prefix="/v0.3/my-day", tags=["my-day"])
Kind = Literal['task', 'reminder', 'note', 'list', 'project', 'goal']


def valid_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError('Choose a valid IANA timezone.')
    return value


class CheckItem(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    done: bool = False


class DocumentSource(BaseModel):
    number: int = Field(ge=1,le=6)
    document_id: UUID
    title: str = Field(min_length=1,max_length=180)
    page: int = Field(ge=1,le=100)
    excerpt: str = Field(max_length=2000)


class DayItemCreate(BaseModel):
    kind: Kind
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(default='', max_length=12000)
    checklist: list[CheckItem] = Field(default_factory=list, max_length=100)
    due_at: datetime | None = None
    timezone: str = Field(default='UTC', max_length=100)
    request_key: UUID
    source_conversation_id: UUID | None = None
    source_documents: list[DocumentSource] = Field(default_factory=list,max_length=6)

    _timezone = field_validator('timezone')(valid_timezone)

    @field_validator('title')
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip(): raise ValueError('A title is required.')
        return value.strip()

    @model_validator(mode='after')
    def check_schedule(self):
        if self.kind == 'reminder' and self.due_at is None:
            raise ValueError('Choose a reminder date and time.')
        if self.due_at and self.due_at.tzinfo is None:
            raise ValueError('Reminder times must include a UTC offset.')
        return self


class DayItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=12000)
    checklist: list[CheckItem] | None = Field(default=None, max_length=100)
    status: Literal['open', 'done', 'archived'] | None = None
    due_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=100)

    @field_validator('title')
    @classmethod
    def title_not_blank(cls, value):
        if value is None or not value.strip(): raise ValueError('A title is required.')
        return value.strip()

    @field_validator('timezone')
    @classmethod
    def check_timezone(cls, value):
        if value is None: raise ValueError('A timezone is required.')
        return valid_timezone(value)

    @model_validator(mode='after')
    def check_schedule(self):
        if self.due_at and self.due_at.tzinfo is None: raise ValueError('Include a UTC offset.')
        for name in ('body','checklist','status'):
            if name in self.model_fields_set and getattr(self,name) is None: raise ValueError(f'{name} cannot be null.')
        return self


async def companion_db(companion_id: str, user: AuthUser):
    db = SupabaseRepository(get_settings(), user.token)
    if not await db.get_companion(companion_id): raise HTTPException(404, 'Companion not found.')
    return db


async def create_item(db, companion_id: str, payload: DayItemCreate):
    if payload.source_conversation_id and not await db.get_conversation(str(payload.source_conversation_id), companion_id):
        raise HTTPException(404, 'Conversation not found.')
    for source in payload.source_documents:
        rows = await db._request('GET','documents',params={'id':f'eq.{source.document_id}',
            'companion_id':f'eq.{companion_id}','select':'id','limit':'1'})
        if not rows: raise HTTPException(404,'A source document is unavailable for this companion.')
    data = payload.model_dump(mode='json')
    rows = await db._request('POST', 'my_day_items', params={'on_conflict': 'companion_id,request_key'},
        headers={'Prefer': 'resolution=ignore-duplicates,return=representation'}, json={**data,'companion_id': companion_id})
    if not rows:
        rows = await db._request('GET','my_day_items',params={'companion_id':f'eq.{companion_id}','request_key':f'eq.{payload.request_key}','limit':'1'})
    if not rows: raise HTTPException(409, 'Could not save this item. Reload My Day before retrying.')
    return rows[0]


@router.get('/companions/{companion_id}')
async def list_items(companion_id: UUID, user: AuthUser = Depends(require_user)):
    db = await companion_db(str(companion_id), user)
    return await db._request('GET','my_day_items',params={'companion_id':f'eq.{companion_id}','order':'created_at.desc','limit':'500'})


@router.post('/companions/{companion_id}')
async def add_item(companion_id: UUID, payload: DayItemCreate, user: AuthUser = Depends(require_user)):
    return await create_item(await companion_db(str(companion_id), user), str(companion_id), payload)


@router.patch('/companions/{companion_id}/items/{item_id}')
async def update_item(companion_id: UUID, item_id: UUID, payload: DayItemUpdate, user: AuthUser = Depends(require_user)):
    db = await companion_db(str(companion_id), user)
    rows = await db._request('GET','my_day_items',params={'id':f'eq.{item_id}','companion_id':f'eq.{companion_id}','limit':'1'})
    if not rows: raise HTTPException(404,'Item not found.')
    changes = payload.model_dump(mode='json',exclude_unset=True)
    if rows[0]['kind']=='reminder' and 'due_at' in changes and changes['due_at'] is None:
        raise HTTPException(400,'A reminder needs a scheduled time.')
    updated = await db._request('PATCH','my_day_items',params={'id':f'eq.{item_id}','companion_id':f'eq.{companion_id}'},
        headers={'Prefer':'return=representation'},json=changes)
    if not updated: raise HTTPException(404,'Item not found.')
    return updated[0]


@router.get('/companions/{companion_id}/due')
async def due_items(companion_id: UUID, user: AuthUser = Depends(require_user)):
    db = await companion_db(str(companion_id),user)
    return await db._request('POST','rpc/my_day_due',json={'p_companion_id':str(companion_id)})


@router.post('/companions/{companion_id}/alerts/{alert_id}/seen')
async def see_alert(companion_id: UUID, alert_id: UUID, user: AuthUser = Depends(require_user)):
    db = await companion_db(str(companion_id),user)
    alerts = await db._request('POST','rpc/my_day_due',json={'p_companion_id':str(companion_id)})
    if not any(row['id']==str(alert_id) for row in alerts): raise HTTPException(404,'Reminder not found.')
    rows = await db._request('PATCH','my_day_alerts',params={'id':f'eq.{alert_id}'},
        headers={'Prefer':'return=representation'},json={'seen_at':datetime.now(timezone.utc).isoformat()})
    return {'seen':bool(rows)}


@router.get('/companions/{companion_id}/search')
async def search(companion_id: UUID, q: str, user: AuthUser = Depends(require_user)):
    if not 2<=len(q.strip())<=200: raise HTTPException(400,'Search with 2 to 200 characters.')
    db = await companion_db(str(companion_id),user)
    return await db._request('POST','rpc/search_my_information',json={'p_companion_id':str(companion_id),'p_query':q.strip()})


def parse_action(text: str, zone: str, now: datetime | None = None):
    """Conservative commands: never turn a casual statement into a commitment."""
    text = re.sub(r'^\s*(?:please\s+)?', '', text.strip(), flags=re.I)
    local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(valid_timezone(zone)))
    if re.fullmatch(r"(?:what(?:'s| is) on my plate(?: today)?|show (?:me )?my (?:day|tasks)|what do i need to do today)[?.!]*",text,re.I):
        return {'read':'agenda'}
    match = re.fullmatch(r'(?:search (?:my )?(?:memories|history|notes)(?: for)?|find in my history)\s*:\s*(.{2,200})',text,re.I)
    if match: return {'read':'search','query':match[1]}
    if re.match(r'remind me\b',text,re.I):
        relative = re.fullmatch(r'remind me in (\d+) (minutes?|hours?|days?) to (.+)',text,re.I)
        scheduled = re.fullmatch(r'remind me (today|tomorrow|on \d{4}-\d{2}-\d{2}) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)? to (.+)',text,re.I)
        if relative:
            amount=int(relative[1]); unit=relative[2].lower()
            if not 1<=amount<=10000: return {'clarify':'Choose a reminder interval between 1 and 10,000 minutes, hours, or days.'}
            due=local.astimezone(timezone.utc)+timedelta(**{'minutes' if unit.startswith('minute') else 'hours' if unit.startswith('hour') else 'days':amount})
            title=relative[3]
        elif scheduled:
            date_text,hour,minute,period,title=scheduled.groups(); hour=int(hour); minute=int(minute or '0')
            if not period and hour<=12: return {'clarify':'Is that AM or PM? For example: remind me tomorrow at 9 am to call the mechanic.'}
            if minute>59 or hour>23 or period and not 1<=hour<=12: return {'clarify':'Please give a valid time, such as 9 am or 14:30.'}
            hour=hour%12+(12 if period.lower()=='pm' else 0) if period else hour
            try:
                day=local.date()+timedelta(days=1 if date_text.lower()=='tomorrow' else 0) if not date_text.lower().startswith('on ') else datetime.fromisoformat(date_text[3:]).date()
                wall=datetime(day.year,day.month,day.day,hour,minute)
                due=wall.replace(tzinfo=local.tzinfo)
                back=due.astimezone(timezone.utc).astimezone(local.tzinfo).replace(tzinfo=None)
                if back!=wall or due.utcoffset()!=due.replace(fold=1).utcoffset():
                    return {'clarify':'That local time is skipped or repeated by a clock change. Choose another time in My Day.'}
            except ValueError: return {'clarify':'Please use a valid date, such as on 2026-10-07 at 9 am.'}
        else: return {'clarify':'When should I remind you? Try “remind me tomorrow at 9 am to call the mechanic” or “remind me in 30 minutes to stretch”.'}
        if due<=local: return {'clarify':'That time has already passed. Choose a future time.'}
        return {'kind':'reminder','title':title,'due_at':due.isoformat(),'timezone':zone}
    # Explicit capture commands preserve the user's words; no model inference.
    match = re.fullmatch(r'(?:add|put) (.+?) (?:to|on) my (.{1,80}?) list[.!]?', text, re.I | re.S)
    if match:
        title = match[2].strip().rstrip('.!').capitalize() + ' list'
        return {'append_list': True, 'kind': 'list', 'title': title,
                'checklist': [{'text': part.strip(), 'done': False} for part in match[1].split(',') if part.strip()]}
    match = re.fullmatch(r'(?:show|read) (?:me )?my (.{1,80}?) list[?.!]*', text, re.I)
    if match:
        return {'read': 'list', 'title': match[1].strip().capitalize() + ' list'}
    match = re.fullmatch(r'(?:save|add) (?:a |this )?gift idea\s*:\s*(.+)', text, re.I | re.S)
    if match:
        return {'append_list': True, 'kind': 'list', 'title': 'Gift ideas list',
                'checklist': [{'text': match[1].strip(), 'done': False}]}
    match = re.fullmatch(r'(?:remember this|take a note)\s*:\s*(.+)', text, re.I | re.S)
    if match:
        return {'kind': 'note', 'title': match[1].strip()[:90], 'body': match[1].strip()}
    patterns=[('task',r'add (?:a )?task\s*:\s*(.+)'),('note',r'(?:save|add) (?:a )?note\s*:\s*(.+)'),
              ('list',r'(?:make|create) (?:a )?(shopping|packing|.+?) list\s*:\s*(.+)'),
              ('project',r'(?:start|create) (?:a )?project\s*:\s*(.+)'),('goal',r'(?:set|create) (?:a )?goal\s*:\s*(.+)')]
    for kind,pattern in patterns:
        match=re.fullmatch(pattern,text,re.I|re.S)
        if not match: continue
        if kind=='list':
            return {'kind':'list','title':match[1].capitalize()+' list','checklist':[{'text':part.strip(),'done':False} for part in match[2].split(',') if part.strip()]}
        return {'kind':kind,'title':match[1].strip()[:90] if kind=='note' else match[1].strip(),'body':match[1].strip() if kind=='note' else ''}
    return None


def reminder_followup(text, recent, now=None):
    """Resolve only a fresh, immediately preceding reminder clarification."""
    if not recent or recent[0].get('role') != 'assistant': return text
    pending=(recent[0].get('metadata') or {}).get('pending_reminder')
    if not isinstance(pending,dict): return text
    try:
        expires=datetime.fromisoformat(pending['expires_at'])
        if expires.tzinfo is None or expires <= (now or datetime.now(timezone.utc)): return text
        original=pending['text']
        if not isinstance(original,str) or len(original)>2000: return text
    except (KeyError,TypeError,ValueError): return text
    reply=text.strip().rstrip('.!').strip()
    if re.fullmatch(r'(?:cancel|never mind|nevermind|forget it)',reply,re.I): return 'cancel pending reminder'
    if re.fullmatch(r'am|pm',reply,re.I):
        return re.sub(r'(at \d{1,2}(?::\d{2})?)\s+to\b',lambda m:m[1]+' '+reply+' to',original,flags=re.I)
    title=re.search(r'\bto\s+(.+)$',original,re.I)
    if title and re.fullmatch(r'(?:today|tomorrow|on \d{4}-\d{2}-\d{2}) at \d{1,2}(?::\d{2})?\s*(?:am|pm)?|in \d+ (?:minutes?|hours?|days?)',reply,re.I):
        return 'remind me '+reply+' to '+title[1]
    return text


async def handle_action(db, companion_id, conversation_id, text, zone, request_key, recent=None):
    text=reminder_followup(text,recent)
    if text=='cancel pending reminder': return {'content':'Okay, I haven’t saved that reminder.','item':None}
    command=parse_action(text,zone)
    if not command: return None
    if 'clarify' in command:
        return {'content':command['clarify'],'item':None,'pending_reminder':{'text':text,'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()}}
    if command.get('read') == 'list':
        rows = await db._request('GET', 'my_day_items', params={
            'companion_id': f'eq.{companion_id}', 'kind': 'eq.list', 'status': 'eq.open',
            'order': 'created_at.desc', 'limit': '500'})
        matches = [row for row in rows if row['title'].casefold() == command['title'].casefold()]
        if len(matches) > 1:
            return {'content': 'More than one open list has that name. Rename one in My Day so I can choose the right list.', 'item': None}
        if not matches:
            return {'content': 'No open list with that name was found. Add an item to create it, or check My Day for completed lists.', 'item': None}
        item = matches[0]
        lines = [f"• {'✓' if row['done'] else '○'} {row['text']}" for row in item['checklist']]
        return {'content': item['title'] + ':\n' + ('\n'.join(lines) or 'This list is empty.'), 'item': None}
    if command.get('read')=='agenda':
        rows=await db._request('GET','my_day_items',params={'companion_id':f'eq.{companion_id}','status':'eq.open','order':'due_at.asc.nullslast,created_at.desc','limit':'50'})
        lines=[]
        for item in rows:
            due=datetime.fromisoformat(item['due_at'].replace('Z','+00:00')).astimezone(ZoneInfo(zone)).strftime('%b %d, %I:%M %p') if item.get('due_at') else 'No scheduled time'
            lines.append(f"• [{item['kind']}] {item['title']} — {due}")
        return {'content':('Here’s what’s on your plate ('+zone+'):\n'+'\n'.join(lines)) if lines else 'Your My Day is clear. Add a task, reminder, list, or note whenever you like.','item':None}
    if command.get('read')=='search':
        rows=await db._request('POST','rpc/search_my_information',json={'p_companion_id':companion_id,'p_query':command['query']})
        return {'content':'Here are matching saved sources:\n'+'\n'.join(f"• [{r['kind']}; source {r['id']}] {r['content']}" for r in rows) if rows else 'I couldn’t find a matching saved source. Try a shorter search phrase.','item':None}
    try:
        payload=DayItemCreate(**{k:v for k,v in command.items() if k != 'append_list'},request_key=request_key,source_conversation_id=conversation_id)
    except ValueError:
        return {'content':'That item is too long or incomplete. Shorten it or add it from My Day.','item':None}
    if command.get('append_list'):
        try:
            rows = await db._request('POST', 'rpc/capture_list_items', json={
                'p_companion_id': companion_id, 'p_conversation_id': conversation_id,
                'p_request_key': request_key, 'p_title': payload.title,
                'p_items': [row.model_dump() for row in payload.checklist]})
            if not rows: raise RuntimeError('No saved list returned')
            item = rows[0]
        except Exception:
            return {'content': 'I couldn’t confirm that list update. Check My Day before retrying. If more than one open list has that name, rename one first.', 'item': None}
    else:
        item=await create_item(db,companion_id,payload)
    detail=''
    if item.get('due_at'):
        detail=' for '+datetime.fromisoformat(item['due_at'].replace('Z','+00:00')).astimezone(ZoneInfo(zone)).strftime('%b %d at %I:%M %p')+' ('+zone+')'
    return {'content':f"Saved your {item['kind']}: {item['title']}{detail}. You can edit, complete, or undo it in My Day.",'item':item}
