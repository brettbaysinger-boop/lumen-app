"""Explicit, owner-scoped web search through the operator's SearXNG service."""
import html
import ipaddress
import re
from urllib.parse import urlsplit
from uuid import UUID
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository

router=APIRouter(prefix='/v0.5/web',tags=['web-search'])


class SearchRequest(BaseModel):
    query: str=Field(min_length=2,max_length=500)

    @field_validator('query')
    @classmethod
    def trim_query(cls,value):
        if len(value.strip())<2:raise ValueError('Enter at least two characters.')
        return value.strip()


def safe_source_url(value):
    if not isinstance(value,str) or len(value)>2000:return None
    try:
        parsed=urlsplit(value)
        host=(parsed.hostname or '').lower().rstrip('.')
        if parsed.scheme not in ('http','https') or not host or parsed.username or parsed.password:return None
        if parsed.port not in (None,80,443):return None
        if host=='localhost' or '.' not in host or host.endswith(('.localhost','.local','.internal','.ts.net')):return None
        try:
            if not ipaddress.ip_address(host).is_global:return None
        except ValueError:pass
        return value
    except ValueError:return None


def plain(value,maximum):
    if not isinstance(value,str):return ''
    return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]*>',' ',value))).strip()[:maximum]


async def search_web(query):
    settings=get_settings()
    if not settings.web_search_url:raise HTTPException(503,'Web search is not configured. Set WEB_SEARCH_URL to your local SearXNG server.')
    try:
        # Only the explicit query goes upstream: no token, chat history or memory.
        async with httpx.AsyncClient(timeout=25,follow_redirects=False) as client:
            response=await client.get(settings.web_search_url.rstrip('/')+'/search',params={
                'q':query,'format':'json','categories':'general','safesearch':1})
        if response.status_code==403:raise HTTPException(503,'Enable the JSON search format on your SearXNG server.')
        response.raise_for_status()
        body=response.json()
        raw=body.get('results') if isinstance(body,dict) else None
        if not isinstance(raw,list):raise ValueError('Invalid search result list')
    except (httpx.HTTPError,ValueError) as exc:
        raise HTTPException(502,'Web search failed. Check the search service and internet connection.') from exc
    sources=[];seen=set()
    for row in raw:
        if not isinstance(row,dict):continue
        url=safe_source_url(row.get('url'))
        if not url or url in seen:continue
        seen.add(url)
        sources.append({'number':len(sources)+1,'title':plain(row.get('title'),250) or url,
                        'url':url,'snippet':plain(row.get('content'),1200)})
        if len(sources)==6:break
    warnings=[]
    if body.get('unresponsive_engines'):warnings.append('Some search engines did not respond; these results may be incomplete.')
    return {'query':query,'sources':sources,'warnings':warnings,'provider':'searxng'}


@router.post('/companions/{companion_id}/search')
async def search(companion_id:UUID,payload:SearchRequest,user:AuthUser=Depends(require_user)):
    if not await SupabaseRepository(get_settings(),user.token).get_companion(str(companion_id)):
        raise HTTPException(404,'Companion not found.')
    return await search_web(payload.query)


def search_command(text):
    match=re.fullmatch(r'\s*(?:please\s+)?search (?:the )?(?:web|internet)(?:\s+for|\s*:)\s*(.+?)\s*',text,re.I|re.S)
    return match[1] if match else None


async def web_action(text):
    query=search_command(text)
    if query is None:return None
    try:
        payload=SearchRequest(query=query)
        results=await search_web(payload.query)
    except ValueError:return {'content':'Use a web search query between 2 and 500 characters.','item':None,'model':'web-search'}
    except HTTPException as exc:return {'content':str(exc.detail),'item':None,'model':'web-search'}
    lines=[f"[{source['number']}] {source['title']}\n{source['snippet']}\n{source['url']}" for source in results['sources']]
    content=('Here are web search results for “'+results['query']+'”. These are search snippets; I haven’t read the full pages.\n\n'+'\n\n'.join(lines)) if lines else 'No usable web search results were returned. Try a more specific query.'
    if results['warnings']:content+='\n\n'+' '.join(results['warnings'])
    return {'content':content,'item':None,'model':'web-search','web_search':results}
