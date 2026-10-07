"""Prepare HTTPS addresses, retaining existing redirects and server secrets."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
import tomllib


def env_value(text, key, default=''):
    match = re.search(rf'(?m)^\s*{re.escape(key)}\s*=\s*(.*)$', text)
    return match[1].strip().strip('\"\'') if match else default


def set_env(text, key, value):
    text = re.sub(rf'(?m)^\s*{re.escape(key)}\s*=.*\n?', '', text)
    return text.rstrip() + f'\n{key}={value}\n'


def prepare(root, hostname):
    hostname = hostname.lower().rstrip('.')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.tail[a-z0-9]+\.ts\.net', hostname):
        raise ValueError('Use the full device MagicDNS hostname, without protocol or port.')
    web = 'https://' + hostname
    client_path, server_path, config_path = root/'.env', root/'backend/.env', root/'supabase/config.toml'
    client, server, config = [p.read_text() for p in (client_path, server_path, config_path)]
    parsed = tomllib.loads(config)
    urls = list(parsed['auth']['additional_redirect_urls'])
    for origin in (web, 'http://localhost:8081', 'http://127.0.0.1:8081'):
        for suffix in ('', '/', '/login', '/recover'):
            if origin + suffix not in urls:
                urls.append(origin + suffix)
    # Edit only the auth section. Google callback configuration stays intact.
    section = re.search(r'(?ms)^\[auth\]\s*\n(.*?)(?=^\[|\Z)', config)
    if not section:
        raise ValueError('Auth section missing.')
    body, count = re.subn(r'(?m)^site_url\s*=\s*"[^"]*"', 'site_url = ' + json.dumps(web), section[1])
    if count != 1:
        raise ValueError('Auth site_url missing or duplicated.')
    body, count = re.subn(r'(?m)^additional_redirect_urls\s*=\s*\[[\s\S]*?\]',
                          'additional_redirect_urls = ' + json.dumps(urls), body)
    if count != 1:
        raise ValueError('Auth redirect list missing or duplicated.')
    config = config[:section.start(1)] + body + config[section.end(1):]
    verified = tomllib.loads(config)
    if verified['auth'].get('external') != parsed['auth'].get('external'):
        raise ValueError('Provider settings changed unexpectedly.')
    client = set_env(client, 'EXPO_PUBLIC_LUMEN_API_URL', web + ':8444')
    client = set_env(client, 'EXPO_PUBLIC_SUPABASE_URL', web + ':8445')
    origins = env_value(server, 'LUMEN_CORS_ORIGINS', 'http://localhost:8081,http://localhost:19006').split(',')
    # Preserve existing configured origins and ensure all known working entry points.
    for origin in (web, 'http://localhost:8081', 'http://127.0.0.1:8081',
                   'http://192.168.86.10:8081', 'http://100.75.227.45:8081', f'http://{hostname}:8081'):
        if origin not in origins:
            origins.append(origin)
    server = set_env(server, 'LUMEN_CORS_ORIGINS', ','.join(o.strip() for o in origins if o.strip()))
    server = set_env(server, 'SUPPORT_RECOVERY_REDIRECT_URL', web + '/recover')
    return {client_path:client, server_path:server, config_path:config}


def save_private(path, text):
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix='.lumen-https-')
    try:
        with os.fdopen(descriptor, 'w') as file:
            file.write(text)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--hostname', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    changes = prepare(root, args.hostname)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = root/'.https-backups'/stamp
    backup.mkdir(parents=True, mode=0o700)
    os.chmod(backup.parent, 0o700)
    # Back up every input before writing any change. Never print contents.
    for path in changes:
        dest = backup/path.relative_to(root)
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        save_private(dest, path.read_text())
    for path, text in changes.items():
        save_private(path, text)
    print('HTTPS addresses prepared. Existing Google callback and redirect entries preserved.')
    print('Private configuration backup:', backup)
    print('Open after deployment:', 'https://' + args.hostname.rstrip('.'))


if __name__ == '__main__':
    main()
