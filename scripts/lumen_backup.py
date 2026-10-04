#!/usr/bin/env python3
"""Private Lumen data backups, copied over SSH to another machine."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import socket
import subprocess
import tarfile
import tempfile
import tomllib
import uuid


def run(args, **kwargs):
    result = subprocess.run(args, check=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, **kwargs)
    return result.stdout


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prune(directory, pattern, keep):
    files = sorted(Path(directory).glob(pattern), reverse=True)
    for path in files[keep:]:
        if path.is_file() and not path.is_symlink():
            path.unlink()


def configuration(path):
    cfg = json.loads(Path(path).read_text())
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9_.-]*', cfg['ssh_host']):
        raise ValueError('SSH destination must have the form user@hostname-or-IP.')
    cfg['project'] = str(Path(cfg['project']).resolve())
    project = Path(cfg['project'])
    project_id = tomllib.loads((project / 'supabase/config.toml').read_text())['project_id']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', project_id):
        raise ValueError('Invalid local Supabase project ID.')
    cfg['container'] = f'supabase_db_{project_id}'
    cfg['source'] = re.sub(r'[^A-Za-z0-9_.-]', '_', socket.gethostname())
    cfg['spool'] = str(Path.home() / '.local/share/lumen-backup-spool' / cfg['source'])
    return cfg


def ssh(cfg):
    return ['ssh', '-i', cfg['ssh_key'], '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
            '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', cfg['ssh_host']]


def psql(cfg, database, sql):
    return run(['docker', 'exec', '-i', cfg['container'], 'psql', '-X', '-q', '-A', '-t',
                '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], input=sql.encode())


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


# This program runs on Helios; archive bytes travel over SSH on stdin.
RECEIVER = r'''
import hashlib, os, pathlib, sys
os.umask(0o077)
source, name, expected = sys.argv[1:]
directory = pathlib.Path.home() / '.local/share/lumen-backups' / source
directory.mkdir(parents=True, exist_ok=True)
directory.chmod(0o700)
temporary = directory / (name + '.partial')
final = directory / name
h = hashlib.sha256()
try:
    with temporary.open('xb') as output:
        while True:
            block = sys.stdin.buffer.read(1024 * 1024)
            if not block: break
            output.write(block)
            h.update(block)
        output.flush()
        os.fsync(output.fileno())
    if h.hexdigest() != expected:
        raise RuntimeError('Backup checksum mismatch; previous backups retained.')
    os.replace(temporary, final)
    final.chmod(0o600)
    fd = os.open(directory, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
    files = sorted(directory.glob('lumen-*.tar.gz'), reverse=True)
    for old in files[30:]:
        if old.is_file() and not old.is_symlink(): old.unlink()
    print('Verified backup stored on Helios: ' + name)
finally:
    temporary.unlink(missing_ok=True)
'''


def backup(cfg):
    if run(['docker', 'inspect', '--format', '{{.State.Running}}', cfg['container']]).strip() != b'true':
        raise RuntimeError('Local Supabase database container is not running.')
    project = Path(cfg['project'])
    spool = Path(cfg['spool'])
    spool.mkdir(parents=True, exist_ok=True)
    spool.chmod(0o700)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    name = f'lumen-{stamp}-{uuid.uuid4().hex[:8]}.tar.gz'
    final = spool / name
    with tempfile.TemporaryDirectory(prefix='.build-', dir=spool) as work:
        work = Path(work)
        dump = work / 'database.dump'
        with dump.open('wb') as output:
            subprocess.run(['docker', 'exec', cfg['container'], 'pg_dump', '-U', 'postgres',
                            '-d', 'postgres', '--format=custom', '--data-only', '--schema=public'],
                           stdout=output, stderr=subprocess.PIPE, check=True)
        # Verify the archive is readable before sending or pruning anything.
        with dump.open('rb') as stream:
            run(['docker', 'exec', '-i', cfg['container'], 'pg_restore', '--list'], stdin=stream)
        tables = json.loads(psql(cfg, 'postgres',
            "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) "
            "FROM pg_tables WHERE schemaname='public';"))
        if not tables or 'messages' not in tables or 'memories' not in tables:
            raise RuntimeError('Lumen tables are missing; backup not published.')
        version = run(['git', '-C', str(project), 'rev-parse', 'HEAD']).decode().strip()
        migrations = sorted((project / 'supabase/migrations').glob('*.sql'))
        if not migrations:
            raise RuntimeError('No migrations found; backup not published.')
        manifest = {'version': 1, 'created_utc': stamp, 'source': cfg['source'],
                    'git_commit': version, 'database_sha256': digest(dump), 'tables': tables,
                    'migration_sha256': {p.name: digest(p) for p in migrations},
                    'scope': 'public schema data; Supabase auth/storage and model files excluded'}
        (work / 'manifest.json').write_text(json.dumps(manifest, indent=2))
        partial = work / name
        with tarfile.open(partial, 'w:gz', dereference=True) as archive:
            archive.add(dump, arcname='database.dump')
            archive.add(work / 'manifest.json', arcname='manifest.json')
            for source, target in [('.env', 'app.env'), ('backend/.env', 'backend.env'),
                                   ('supabase/config.toml', 'supabase-config.toml')]:
                archive.add(project / source, arcname=target)
            for migration in migrations:
                archive.add(migration, arcname='migrations/' + migration.name)
        partial.chmod(0o600)
        os.replace(partial, final)
    # Keep seven complete local copies even if remote transfer fails.
    prune(spool, 'lumen-*.tar.gz', 7)
    command = shlex.join(['python3', '-c', RECEIVER, cfg['source'], name, digest(final)])
    with final.open('rb') as stream:
        message = run(ssh(cfg) + [command], stdin=stream).decode().strip()
    print(message)
    print('Local backup: ' + str(final))


def extract_checked(archive, directory):
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar.getmembers():
            parts = Path(member.name).parts
            if member.name.startswith('/') or '..' in parts or not member.isfile():
                raise ValueError('Backup contains an unsafe archive entry.')
            allowed = member.name in {'database.dump', 'manifest.json', 'app.env', 'backend.env',
                                      'supabase-config.toml'} or (
                len(parts) == 2 and parts[0] == 'migrations' and parts[1].endswith('.sql'))
            if not allowed:
                raise ValueError('Unexpected backup entry: ' + member.name)
            target = Path(directory) / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as src, target.open('wb') as dst:
                import shutil
                shutil.copyfileobj(src, dst)
            target.chmod(0o600)
    manifest = json.loads((Path(directory) / 'manifest.json').read_text())
    if digest(Path(directory) / 'database.dump') != manifest['database_sha256']:
        raise ValueError('Database checksum mismatch.')
    for name, expected in manifest['migration_sha256'].items():
        if Path(name).name != name or digest(Path(directory) / 'migrations' / name) != expected:
            raise ValueError('Migration checksum mismatch.')
    return manifest


def drill(cfg, archive):
    """Restore into a unique disposable database, never the live postgres DB."""
    database = 'lumen_restore_check_' + uuid.uuid4().hex
    created = False
    with tempfile.TemporaryDirectory(prefix='lumen-restore-') as directory:
        directory = Path(directory)
        manifest = extract_checked(archive, directory)
        try:
            psql(cfg, 'postgres', f'CREATE DATABASE {database};')
            created = True
            for name in sorted(manifest['migration_sha256']):
                psql(cfg, database, (directory / 'migrations' / name).read_text())
            tables = manifest['tables']
            if not tables or any(not isinstance(t, str) for t in tables):
                raise ValueError('Invalid table list in backup.')
            # Remove only the seed rows in the newly created test database.
            psql(cfg, database, 'TRUNCATE ' + ', '.join('public.' + identifier(t) for t in tables) + ' CASCADE;')
            with (directory / 'database.dump').open('rb') as stream:
                run(['docker', 'exec', '-i', cfg['container'], 'pg_restore', '-U', 'postgres',
                     '-d', database, '--data-only', '--no-owner', '--no-privileges',
                     '--single-transaction', '--exit-on-error'], stdin=stream)
            total = 0
            for table in tables:
                count = int(psql(cfg, database, 'SELECT count(*) FROM public.' + identifier(table) + ';'))
                total += count
                print(f'{table}: {count} restored rows')
            print(f'Restore check passed: {len(tables)} tables, {total} rows. Live data unchanged.')
        finally:
            if created:
                psql(cfg, 'postgres', f'DROP DATABASE {database} WITH (FORCE);')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default=str(Path.home() / '.config/lumen-backup/config.json'))
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('backup')
    check = sub.add_parser('check')
    check.add_argument('--archive')
    args = parser.parse_args()
    cfg = configuration(args.config)
    if args.command == 'backup':
        backup(cfg)
    else:
        copies = sorted(Path(cfg['spool']).glob('lumen-*.tar.gz'), reverse=True)
        archive = Path(args.archive) if args.archive else (copies[0] if copies else None)
        if archive is None:
            raise RuntimeError('No local backup available. Run backup first.')
        drill(cfg, archive)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        import sys
        print('Backup command failed: ' + str(exc.stderr.decode(errors='replace') if exc.stderr else exc), file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:
        import sys
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
