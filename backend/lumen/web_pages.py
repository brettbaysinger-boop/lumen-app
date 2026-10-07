"""Bounded public page excerpts with DNS-pinned connections and no credentials."""
import asyncio
from datetime import datetime, timezone
from html.parser import HTMLParser
import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import quote, urljoin, urlsplit
from .web_search import safe_source_url

MAX_BYTES = 512 * 1024
MAX_TEXT = 4000
PAGE_SECONDS = 15
MAX_PAGES = 3


class PageError(ValueError):
    pass


def public_addresses(host, port):
    records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = []
    for family, _, _, _, address in records:
        ip = ipaddress.ip_address(address[0])
        if not ip.is_global or ip.is_multicast or ip.is_reserved or (isinstance(ip, ipaddress.IPv6Address) and (
            ip.ipv4_mapped or ip.sixtofour or ip.teredo or ip in ipaddress.ip_network('64:ff9b::/96')
            or ip in ipaddress.ip_network('64:ff9b:1::/48'))):
            raise PageError('Private or special network address blocked')
        if family not in (socket.AF_INET, socket.AF_INET6):
            raise PageError('Unsupported network address')
        if (family, address) not in addresses:
            addresses.append((family, address))
    if not addresses:
        raise PageError('No public address found')
    return addresses


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, timeout, secure):
        super().__init__(host, port, timeout=timeout)
        self.address = address
        self.secure = secure

    def connect(self):
        family, address = self.address
        sock = socket.socket(family, socket.SOCK_STREAM)
        try:
            sock.settimeout(self.timeout)
            sock.connect(address)  # Literal validated address: no second DNS lookup.
            if self.secure:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.host)
            self.sock = sock
            self.read_socket = sock
        except BaseException:
            sock.close()
            raise


class PageText(HTMLParser):
    SKIP = {'script', 'style', 'noscript', 'nav', 'footer', 'header', 'form', 'svg', 'template'}
    BLOCK = {'p', 'div', 'section', 'article', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'tr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.hidden.append(tag)
        elif tag in self.BLOCK and not self.hidden:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in self.hidden:
            self.hidden = self.hidden[:self.hidden.index(tag)]
        elif tag in self.BLOCK and not self.hidden:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    def text(self):
        lines = [' '.join(line.split()) for line in ''.join(self.parts).splitlines()]
        return '\n'.join(line for line in lines if line)[:MAX_TEXT]


def read_page(url):
    deadline = time.monotonic() + PAGE_SECONDS
    for hop in range(4):
        if not safe_source_url(url) or any(ord(c) < 33 for c in url) or '\\' in url:
            raise PageError('Unsafe URL blocked')
        parsed = urlsplit(url)
        host = parsed.hostname.encode('idna').decode('ascii').lower().rstrip('.')
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        addresses = public_addresses(host, port)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise PageError('Page deadline exceeded')
        connection = PinnedConnection(host, port, addresses[0], min(remaining, 10), parsed.scheme == 'https')
        response = None
        try:
            target = quote(parsed.path or '/', safe='/%:@!$&\'()*+,;=-._~')
            if parsed.query:
                target += '?' + quote(parsed.query, safe='/%:@!$&\'()*+,;=?-._~')
            host_header = host + (f':{port}' if port != (443 if parsed.scheme == 'https' else 80) else '')
            # Never forward Auth, cookies, search-service headers or chat history.
            connection.request('GET', target, headers={'Host': host_header,
                'User-Agent': 'LumenResearch/1.0', 'Accept': 'text/html,text/plain', 'Accept-Encoding':'identity'})
            response = connection.getresponse()
            if response.status in (301,302,303,307,308):
                location = response.getheader('Location')
                if not location or hop == 3:
                    raise PageError('Redirect limit exceeded')
                next_url = urljoin(url, location)
                if parsed.scheme == 'https' and urlsplit(next_url).scheme != 'https':
                    raise PageError('Insecure redirect blocked')
                url = next_url
                continue  # Every redirect is resolved and validated again.
            if response.status != 200:
                raise PageError('Page not available')
            content_type = response.getheader('Content-Type', '').split(';')[0].strip().lower()
            if content_type not in ('text/html','text/plain'):
                raise PageError('Only text pages are supported')
            if response.getheader('Content-Encoding', 'identity').lower() != 'identity':
                raise PageError('Compressed response not supported')
            length = response.getheader('Content-Length')
            if length and int(length) > MAX_BYTES:
                raise PageError('Page too large')
            data = bytearray()
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PageError('Page deadline exceeded')
                if getattr(connection, "read_socket", None):
                    connection.read_socket.settimeout(min(remaining,10))
                chunk = response.read1(min(16384, MAX_BYTES + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise PageError('Page too large')
            charset = response.headers.get_content_charset() or 'utf-8'
            try:
                decoded = data.decode(charset, errors='replace')
            except LookupError:
                decoded = data.decode('utf-8', errors='replace')
            if content_type == 'text/html':
                parser = PageText()
                parser.feed(decoded)
                text = parser.text()
            else:
                text = decoded.strip()[:MAX_TEXT]
            if len(text.strip()) < 80:
                raise PageError('Too little readable text')
            return {'text':text, 'url':url, 'retrieved_at':datetime.now(timezone.utc).isoformat()}
        finally:
            if response is not None:
                response.close()
            connection.close()
    raise PageError('Redirect limit exceeded')


async def retrieve_sources(results):
    async def retrieve(source, index):
        if index >= MAX_PAGES:
            source['retrieval'] = {'status':'snippet_only'}
            return source['snippet']
        try:
            page = await asyncio.wait_for(asyncio.to_thread(read_page, source['url']), PAGE_SECONDS + 2)
            source['retrieval'] = {'status':'page_excerpt', 'characters':len(page['text']),
                'retrieved_at':page['retrieved_at'], 'final_url':page['url']}
            return page['text']
        except (PageError, OSError, ValueError, http.client.HTTPException, asyncio.TimeoutError):
            source['retrieval'] = {'status':'snippet_only'}
            return source['snippet']
    return await asyncio.gather(*(retrieve(source, i) for i, source in enumerate(results['sources'])))
