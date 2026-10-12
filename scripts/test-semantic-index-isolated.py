#!/usr/bin/env python3
"""Test foundation SQL in a NEW, no-network container, never in live Supabase.

Reads only the running database container ID and immutable image ID. The image
is reused without pulling; its normal entrypoint is bypassed. Only synthetic
SQL goes to a new PostgreSQL server on a private Unix socket. No host volumes,
ports, production credentials, or existing database files are mounted.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import shlex
import time
import unittest
import uuid

BASE_FILES = {
    '20261003080506_companion_schema_v1.sql': '6b5a6d53b2822d230e29e95f283fa92ee3286f8b',
    '20261005210305_accounts_and_memory_subjects_retry.sql': 'eb52c3d09ebdc359267dae81b12d18801f7ec1a5',
    '20261010190000_memory_corrections.sql': '82526eda99261d50f84230487434125aed7b03d3',
}
MIGRATION = '20261012063000_memory_semantic_foundation.sql'
EXPECTED_CHECKS = 59
PREFIX = 'LUMEN_SQL_RESULT='

# Image-native PATH and pg_config come before known installation layouts.
# No filesystem-wide search and no commands inside the live database container.
DISCOVERY = r'''
pg_suite_available() {
 case "$1" in /*) ;; *) return 1 ;; esac
 [ -d "$1" ] || return 1
 for tool in initdb pg_ctl postgres psql; do
  [ -f "$1/$tool" ] && [ -x "$1/$tool" ] || return 1
 done
}
find_pg_bin() {
 candidate=$(command -v initdb 2>/dev/null || :)
 case "$candidate" in
  /*)
   candidate=${candidate%/initdb}
   if pg_suite_available "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
   ;;
 esac
 if command -v pg_config >/dev/null 2>&1; then
  candidate=$(pg_config --bindir </dev/null 2>/dev/null || :)
  if pg_suite_available "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
 fi
 # Active profile aliases precede versioned fallback locations. They retain
 # the installed image's extension wrappers rather than a bare Nix derivation.
 for candidate in "$pg_active_bin" "$pg_nix_bin" "$pg_system_bin"; do
  if pg_suite_available "$candidate"; then printf '%s\n' "$candidate"; return 0; fi
 done
 found=''
 for candidate in "$@"; do
  if pg_suite_available "$candidate"; then
   if [ -n "$found" ] && [ "$found" != "$candidate" ]; then
    printf '%s\n' 'Multiple fallback PostgreSQL installations; refusing to guess.' >&2
    return 40
   fi
   found=$candidate
  fi
 done
 if [ -n "$found" ]; then printf '%s\n' "$found"; return 0; fi
 printf '%s\n' 'No complete PostgreSQL tool suite found via PATH, pg_config or supported layouts.' >&2
 return 40
}
'''

ACTIVE_LOCATIONS = r'''
pg_active_bin=/usr/lib/postgresql/bin
pg_nix_bin=/nix/var/nix/profiles/default/bin
pg_system_bin=/run/current-system/sw/bin
'''

SHELL = "set -eu\ncd /tmp\n" + ACTIVE_LOCATIONS + DISCOVERY + r'''
bin=$(find_pg_bin /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /usr/local/bin /usr/bin /nix/store/*postgres*/bin) || exit 40
printf 'LUMEN_PG_BIN=%s\n' "$bin"
"$bin/postgres" --version </dev/null
"$bin/initdb" -D /tmp/lumen-pg -U postgres -A trust --no-locale -E UTF8 </dev/null > /tmp/init.log 2>&1 || { cat /tmp/init.log; exit 41; }
"$bin/pg_ctl" -D /tmp/lumen-pg -l /tmp/server.log -w -t 30 \
 -o "-c listen_addresses='' -c unix_socket_directories=/tmp -c shared_buffers=32MB -c max_connections=12" start </dev/null > /tmp/start.log 2>&1 || { cat /tmp/start.log /tmp/server.log; exit 42; }
"$bin/psql" -X -qAt -v ON_ERROR_STOP=1 -h /tmp -U postgres -d postgres
'''



def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def environment() -> dict[str, str]:
    return {'PATH': '/usr/local/bin:/usr/bin:/bin:/snap/bin', 'LANG': 'C.UTF-8',
            'LC_ALL': 'C.UTF-8', 'HOME': '/tmp'}


def docker_command(root: Path) -> list[str]:
    return ['docker', '--host', 'unix:///var/run/docker.sock', '--config', str(root / 'docker-config')]


def command(args: list[str], *, timeout: int = 20, data: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env=environment(), timeout=timeout, check=False)


def image_from_metadata(output: str) -> str:
    value = output.strip()
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', value):
        raise RuntimeError('Unexpected image identity; no test container started')
    return value


def choose_database(lines: str) -> str:
    ids = [x.strip() for x in lines.splitlines() if x.strip()]
    if len(ids) != 1 or not re.fullmatch(r'[0-9a-f]{64}', ids[0]):
        raise RuntimeError('Expected exactly one running supabase_db_ container; no live container selected')
    return ids[0]


def create_args(root: Path, image: str, token: str) -> list[str]:
    if not re.fullmatch(r'[0-9a-f]{32}', token):
        raise RuntimeError('Invalid test identity')
    image_from_metadata(image)
    return docker_command(root)+[
        'create', '--pull=never', '--name', 'lumen-semantic-test-'+token,
        '--label', 'lumen.semantic-test='+token, '--interactive', '--network', 'none',
        '--read-only', '--user', 'postgres', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--cpus', '2', '--memory', '1g',
        '--memory-swap', '1g', '--pids-limit', '128',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=268435456,mode=1777',
        '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,nodev,size=16777216,mode=1777',
        '--env', 'HOME=/tmp', '--entrypoint', '/bin/sh', image, '-c', SHELL,
    ]


def setup_sql(schema: str) -> str:
    if schema not in ('public', 'extensions'):
        raise RuntimeError('Invalid fixture namespace')
    return f"""
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
CREATE EXTENSION vector WITH SCHEMA {schema};
SET LOCAL search_path=public,extensions;
"""


def sql_input(root: Path) -> bytes:
    migrations = root/'supabase'/'migrations'
    base = []
    for name, expected in BASE_FILES.items():
        data = (migrations/name).read_bytes()
        if blob_sha(data) != expected:
            raise RuntimeError('Baseline migration checksum mismatch: '+name)
        base.append(data.decode())
    migration = (migrations/MIGRATION).read_text()
    tests = (root/'scripts'/'test-semantic-index.sql').read_text()
    result = []
    for schema in ('public', 'extensions'):
        result.extend([setup_sql(schema), *base, migration, tests, 'RESET ROLE; ROLLBACK;'])
    return '\n'.join(result).encode()


def parse_results(stdout: str) -> list[dict]:
    rows = [json.loads(line[len(PREFIX):]) for line in stdout.splitlines() if line.startswith(PREFIX)]
    if len(rows) != 2 or {x.get('vector_schema') for x in rows} != {'public', 'extensions'}:
        raise RuntimeError('Both PostgreSQL namespace runs did not complete')
    if any(x.get('checks_passed') != EXPECTED_CHECKS for x in rows):
        raise RuntimeError('SQL assertion count incomplete')
    return rows


def failure_tail(stdout: bytes, stderr: bytes) -> str:
    # Both streams contain only disposable bootstrap / synthetic test output.
    # Reserve space for each so SQL notices cannot hide an initdb error.
    return ('DISPOSABLE STDOUT (tail):\n'+stdout.decode(errors='replace')[-3000:]
            +'\nDISPOSABLE STDERR (tail):\n'+stderr.decode(errors='replace')[-3000:])


def main_run(root: Path) -> int:
    root = root.resolve(strict=True)
    run = root/'sql-validation'
    run.mkdir(mode=0o700)  # Never overwrite a previous test run.
    (run/'docker-config').mkdir(mode=0o700)
    report = {'status': 'started', 'production_database_accessed': False,
              'production_modified': False, 'data': 'synthetic fixtures only',
              'auth_scope': 'real PostgreSQL roles/RLS with auth.uid session-claim shim; not HTTP JWT verification',
              'concurrency_stress_tested': False, 'cleanup_verified': False}
    cid = None
    token = uuid.uuid4().hex
    try:
        sql = sql_input(root)  # All file validation before touching Docker.
        dk = docker_command(run)
        selected = command(dk+['ps', '--no-trunc', '--filter', 'name=^/supabase_db_', '--format', '{{.ID}}'])
        if selected.returncode:
            raise RuntimeError('Cannot query local Docker. No sudo, remote Docker, or model download attempted')
        source_cid = choose_database(selected.stdout.decode())
        meta = command(dk+['inspect', '--format', '{{.Image}}', source_cid])
        if meta.returncode:
            raise RuntimeError('Cannot read existing image ID')
        image = image_from_metadata(meta.stdout.decode())
        report['database_image_id'] = image
        print('Starting a disposable, no-network PostgreSQL container from the installed image.', flush=True)
        created = command(create_args(run, image, token))
        if created.returncode:
            (run/'container-create.log').write_bytes(created.stdout+created.stderr)
            raise RuntimeError('Disposable container creation failed; see sql-validation/container-create.log')
        cid = created.stdout.decode().strip()
        if not re.fullmatch(r'[0-9a-f]{64}', cid):
            cid = None
            raise RuntimeError('Docker did not return a valid new container ID')
        report['test_container_id'] = cid
        result = command(dk+['start', '--attach', '--interactive', cid], timeout=150, data=sql)
        (run/'postgres-test.log').write_bytes(result.stdout+b'\n'+result.stderr)
        if result.returncode:
            print(failure_tail(result.stdout, result.stderr), file=sys.stderr)
            raise RuntimeError('Isolated PostgreSQL validation failed; live Lumen was not migrated')
        for line in result.stdout.decode(errors='replace').splitlines():
            if line.startswith('LUMEN_PG_BIN='):
                report['postgres_binary_directory'] = line.split('=', 1)[1]
                print('PostgreSQL binaries: '+report['postgres_binary_directory'], flush=True)
        report['sql_runs'] = parse_results(result.stdout.decode())
        report['status'] = 'isolated_sql_passed'
        for row in report['sql_runs']:
            print(f"  {row['vector_schema']}: {row['checks_passed']} SQL checks passed; PostgreSQL {row['postgres_version']}, pgvector {row['vector_version']}", flush=True)
    except (OSError, RuntimeError, subprocess.TimeoutExpired, KeyboardInterrupt, ValueError) as exc:
        report['status'] = 'failed_or_interrupted'
        report['error'] = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print('STOPPED: '+report['error'], file=sys.stderr)
    finally:
        if cid:
            try:
                owned = command(docker_command(run)+['inspect', '--format', '{{index .Config.Labels "lumen.semantic-test"}}', cid])
                if owned.returncode == 0 and owned.stdout.decode().strip() == token:
                    removed = command(docker_command(run)+['rm', '--force', '--volumes', cid])
                    remaining = command(docker_command(run)+['ps', '--all', '--no-trunc', '--filter', 'id='+cid, '--format', '{{.ID}}'])
                    report['cleanup_verified'] = removed.returncode == 0 and remaining.returncode == 0 and not remaining.stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                pass
        else:
            report['cleanup_verified'] = True  # No created container identity.
        if not report['cleanup_verified']:
            report['status'] = 'cleanup_unverified'
            print('Cleanup unverified for the new test container only: '+str(cid), file=sys.stderr)
        dest = run/'sql-result.json'
        fd = os.open(dest, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        with os.fdopen(fd,'w') as file:
            json.dump(report,file,indent=2)
        print('SQL REPORT SAVED: '+str(dest), flush=True)
    return 0 if report['status'] == 'isolated_sql_passed' else 1


class RunnerTests(unittest.TestCase):
    def test_only_one_source_container(self):
        self.assertEqual(choose_database('a'*64+'\n'), 'a'*64)
    def test_ambiguous_source_refused(self):
        with self.assertRaises(RuntimeError): choose_database('a'*64+'\n'+'b'*64)
    def test_bad_image_refused(self):
        with self.assertRaises(RuntimeError): image_from_metadata('postgres:latest')
    def test_environment_does_not_inherit_secrets(self):
        self.assertEqual(set(environment()), {'PATH','LANG','LC_ALL','HOME'})
    def test_no_network_no_volumes_no_pull(self):
        args = create_args(Path('/tmp/test'), 'sha256:'+'a'*64, 'b'*32)
        self.assertEqual(args[args.index('--network')+1], 'none')
        self.assertIn('--pull=never', args)
        self.assertNotIn('--volume', args)
        self.assertNotIn('-v', args)
        self.assertNotIn('--publish', args)
        self.assertNotIn('--privileged', args)
    def test_installed_entrypoint_bypassed(self):
        args=create_args(Path('/tmp/test'),'sha256:'+'a'*64,'b'*32)
        self.assertEqual(args[args.index('--entrypoint')+1],'/bin/sh')
        self.assertIn("listen_addresses=''",SHELL)
    def test_namespace_allowlist(self):
        with self.assertRaises(RuntimeError): setup_sql('anything; DROP DATABASE postgres;')
    def test_missing_sql_runs_refused(self):
        with self.assertRaises(RuntimeError): parse_results('')
    def test_validated_count_for_both_namespaces(self):
        text='\n'.join(PREFIX+json.dumps({'checks_passed':EXPECTED_CHECKS,'vector_schema':s}) for s in ('public','extensions'))
        self.assertEqual(len(parse_results(text)),2)
    def test_incomplete_sql_counts_refused(self):
        text='\n'.join(PREFIX+json.dumps({'checks_passed':1,'vector_schema':s}) for s in ('public','extensions'))
        with self.assertRaises(RuntimeError): parse_results(text)


class BinaryDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lumen-pg-locator-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pathdir = self.root / 'empty-path'
        self.pathdir.mkdir()

    def suite(self, relative, omit=()):
        folder = self.root / relative
        folder.mkdir(parents=True, exist_ok=True)
        for tool in ('initdb', 'pg_ctl', 'postgres', 'psql'):
            if tool not in omit:
                self.executable(folder / tool, "#!/bin/sh\nprintf '%s\\n' 'fake PostgreSQL 17.11'\n")
        return folder

    def executable(self, path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        path.chmod(0o700)

    def locate(self, *, path=None, fallback=(), active=None, nix=None):
        assigns = '\n'.join(name+'='+shlex.quote(str(value) if value else '') for name, value in (
            ('pg_active_bin', active), ('pg_nix_bin', nix), ('pg_system_bin', None)))
        script = 'set -eu\n'+assigns+'\n'+DISCOVERY+'\nfind_pg_bin "$@"\n'
        return subprocess.run(['/bin/sh', '-c', script, 'locator-test', *map(str, fallback)],
            input=b'', stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
            env={'PATH': str(path or self.pathdir), 'HOME': str(self.root), 'LC_ALL': 'C'}, timeout=5)

    def test_image_path_is_preferred(self):
        native = self.suite('native/bin')
        other = self.suite('other/bin')
        result = self.locate(path=native, fallback=[other])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(native))

    def test_pg_config_reported_bindir(self):
        target = self.suite('compiled-location/bin')
        self.executable(self.pathdir/'pg_config', '#!/bin/sh\n[ "$1" = --bindir ] || exit 2\nprintf "%s\\n" '+shlex.quote(str(target))+'\n')
        result = self.locate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_supabase_unversioned_bin(self):
        target = self.suite('usr/lib/postgresql/bin')
        result = self.locate(active=target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_nix_active_profile(self):
        target = self.suite('nix/var/nix/profiles/default/bin')
        result = self.locate(nix=target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_debian_versioned_fallback(self):
        target = self.suite('usr/lib/postgresql/17/bin')
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_nix_store_fallback(self):
        target = self.suite('nix/store/abc-postgresql-17.11/bin')
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_missing_companion_tool_refused(self):
        incomplete = self.suite('incomplete/bin', omit=('pg_ctl',))
        result = self.locate(path=incomplete, fallback=[incomplete])
        self.assertEqual(result.returncode, 40)
        self.assertIn(b'No complete PostgreSQL', result.stderr)

    def test_non_executable_tool_refused(self):
        target = self.suite('non-executable/bin')
        (target/'initdb').chmod(0o600)
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 40)

    def test_broken_pg_config_falls_back(self):
        self.executable(self.pathdir/'pg_config', '#!/bin/sh\nexit 9\n')
        target = self.suite('fallback/bin')
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_client_only_pg_config_falls_back(self):
        client = self.suite('client-only/bin', omit=('initdb', 'postgres', 'pg_ctl'))
        self.executable(self.pathdir/'pg_config', '#!/bin/sh\nprintf "%s\\n" '+shlex.quote(str(client))+'\n')
        target = self.suite('fallback/bin')
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_multiple_fallback_suites_refused(self):
        result = self.locate(fallback=[self.suite('one/bin'), self.suite('two/bin')])
        self.assertEqual(result.returncode, 40)
        self.assertIn(b'refusing to guess', result.stderr)

    def test_no_installation_refused(self):
        result = self.locate()
        self.assertEqual(result.returncode, 40)
        self.assertIn(b'No complete PostgreSQL', result.stderr)

    def test_directory_spaces_are_quoted(self):
        target = self.suite('postgres test/bin')
        result = self.locate(fallback=[target])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.decode().strip(), str(target))

    def test_original_locator_misses_unversioned_layout(self):
        target = self.suite('usr/lib/postgresql/bin')
        old = r"""set -eu
bin=''
for p in "$1"/usr/lib/postgresql/*/bin/initdb "$1"/usr/local/pgsql/bin/initdb "$1"/usr/local/bin/initdb; do
 if [ -x "$p" ]; then bin="${p%/initdb}"; break; fi
done
[ -n "$bin" ] || exit 40
"""
        result = subprocess.run(['/bin/sh', '-c', old, 'old-locator', str(self.root)],
            input=b'', stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        self.assertEqual(result.returncode, 40)
        self.assertEqual(self.locate(active=target).returncode, 0)

    def fake_boot(self, failure=False):
        target = self.suite('fake/bin')
        # These are shell stand-ins, not a PostgreSQL server. The bootstrap
        # itself is real /bin/sh and only its fixed /tmp paths are relocated.
        for tool in ('initdb', 'pg_ctl'):
            self.executable(target/tool, '#!/bin/sh\n/bin/cat >/dev/null\n'
                + ('printf "%s\\n" "synthetic initdb failure"; exit 41\n'
                   if failure and tool == 'initdb' else 'exit 0\n'))
        self.executable(target/'psql', '#!/bin/sh\nexec /bin/cat\n')
        scratch = self.root/'scratch'
        scratch.mkdir()
        shell = SHELL.replace('/tmp', str(scratch))
        result = subprocess.run(['/bin/sh', '-c', shell], input=b'SYNTHETIC_SQL_STDIN\n',
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=5,
            env={'PATH': str(target)+':/usr/bin:/bin', 'HOME': str(self.root), 'LC_ALL': 'C'})
        return result

    def test_bootstrap_preserves_sql_stdin(self):
        result = self.fake_boot()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(b'LUMEN_PG_BIN=', result.stdout)
        self.assertTrue(result.stdout.endswith(b'SYNTHETIC_SQL_STDIN\n'))

    def test_initdb_failure_not_mislabeled_success(self):
        result = self.fake_boot(failure=True)
        self.assertEqual(result.returncode, 41)
        self.assertIn(b'synthetic initdb failure', result.stdout)
        self.assertNotIn(b'SYNTHETIC_SQL_STDIN', result.stdout)

    def test_failure_tail_keeps_both_streams(self):
        text = failure_tail(b'initdb detail', b'notice '*2000)
        self.assertIn('initdb detail', text)
        self.assertIn('DISPOSABLE STDERR', text)
        self.assertLess(len(text), 6200)

    def test_no_recursive_filesystem_search(self):
        self.assertNotIn('find /', SHELL)
        self.assertNotIn('sudo', SHELL)
        self.assertNotIn('apt-get', SHELL)


if __name__=='__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test',action='store_true')
    parser.add_argument('--workspace',type=Path)
    args=parser.parse_args()
    if args.self_test:
        suite = unittest.TestSuite([
            unittest.defaultTestLoader.loadTestsFromTestCase(RunnerTests),
            unittest.defaultTestLoader.loadTestsFromTestCase(BinaryDiscoveryTests),
        ])
        result=unittest.TextTestRunner(verbosity=2).run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    if not args.workspace:
        parser.error('--workspace required; no live-database option exists')
    sys.exit(main_run(args.workspace))
