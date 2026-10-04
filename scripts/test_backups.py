import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

spec = importlib.util.spec_from_file_location('lumen_backup', Path(__file__).with_name('lumen_backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupChecks(unittest.TestCase):
    def test_local_snapshot_survives_failed_remote_upload(self):
        with tempfile.TemporaryDirectory() as folder:
            project = Path(folder) / 'project'
            (project / 'backend').mkdir(parents=True)
            (project / 'supabase/migrations').mkdir(parents=True)
            (project / '.env').write_text('client-settings')
            (project / 'backend/.env').write_text('private-test-key')
            (project / 'supabase/config.toml').write_text('project_id="test"')
            (project / 'supabase/migrations/001.sql').write_text('CREATE TABLE public.messages(id int);')
            spool = Path(folder) / 'spool'
            cfg = dict(project=str(project), spool=str(spool), container='test', source='source',
                       ssh_key='/unused-key', ssh_host='user@helios')
            def command(args, **kwargs):
                if args[0] == 'ssh': raise RuntimeError('Helios offline')
                if args[:2] == ['docker', 'inspect']: return b'true'
                if args[0] == 'git': return b'code-commit'
                return b'archive readable'
            def pg_dump(args, **kwargs):
                self.assertIn('--data-only', args)
                kwargs['stdout'].write(b'PGDMP test snapshot')
                return subprocess.CompletedProcess(args, 0)
            with patch.object(backup, 'run', side_effect=command), patch.object(
                    backup, 'psql', return_value=b'["messages","memories"]'), patch.object(
                    backup.subprocess, 'run', side_effect=pg_dump), redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, 'Helios offline'):
                    backup.backup(cfg)
            files = list(spool.glob('lumen-*.tar.gz'))
            self.assertEqual(len(files), 1)
            self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
            restored = Path(folder) / 'extracted'
            restored.mkdir()
            backup.extract_checked(files[0], restored)
            self.assertEqual((restored / 'backend.env').read_text(), 'private-test-key')
            self.assertEqual((restored / 'database.dump').read_bytes(), b'PGDMP test snapshot')

    def test_remote_verified_atomic_copy_and_retention(self):
        with tempfile.TemporaryDirectory() as home:
            directory = Path(home) / '.local/share/lumen-backups/source'
            directory.mkdir(parents=True)
            for i in range(31):
                (directory / f'lumen-{i:04}.tar.gz').write_bytes(b'old')
            payload = b'private backup bytes'
            wrapper = ('import pathlib\nfrom unittest.mock import patch\n'
                       f'with patch("pathlib.Path.home", return_value=pathlib.Path({home!r})):\n'
                       f'    exec({backup.RECEIVER!r})\n')
            result = subprocess.run([sys.executable, '-c', wrapper, 'source',
                'lumen-9999.tar.gz', hashlib.sha256(payload).hexdigest()],
                input=payload, capture_output=True, check=True)
            final = directory / 'lumen-9999.tar.gz'
            self.assertEqual(final.read_bytes(), payload)
            self.assertEqual(final.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(list(directory.glob('lumen-*.tar.gz'))), 30)
            self.assertFalse(list(directory.glob('*.partial')))
            self.assertIn(b'Verified', result.stdout)

    def test_bad_remote_checksum_preserves_previous_backups(self):
        with tempfile.TemporaryDirectory() as home:
            directory = Path(home) / '.local/share/lumen-backups/source'
            directory.mkdir(parents=True)
            old = directory / 'lumen-old.tar.gz'
            old.write_bytes(b'old')
            wrapper = ('import pathlib\nfrom unittest.mock import patch\n'
                       f'with patch("pathlib.Path.home", return_value=pathlib.Path({home!r})):\n'
                       f'    exec({backup.RECEIVER!r})\n')
            result = subprocess.run([sys.executable, '-c', wrapper, 'source',
                'lumen-new.tar.gz', 'wrong-checksum'], input=b'broken',
                capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(old.read_bytes(), b'old')
            self.assertFalse((directory / 'lumen-new.tar.gz').exists())
            self.assertFalse(list(directory.glob('*.partial')))

    def archive(self, directory):
        dump = b'PGDMP test data'
        migration = b'CREATE TABLE public.messages(id int);'
        manifest = {'database_sha256': hashlib.sha256(dump).hexdigest(),
                    'migration_sha256': {'001.sql': hashlib.sha256(migration).hexdigest()},
                    'tables': ['messages']}
        archive = Path(directory) / 'backup.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name, content in [('database.dump', dump), ('migrations/001.sql', migration),
                                  ('manifest.json', json.dumps(manifest).encode())]:
                member = tarfile.TarInfo(name)
                member.size = len(content)
                tar.addfile(member, io.BytesIO(content))
        return archive

    def test_checksum_and_path_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = self.archive(folder)
            target = Path(folder) / 'restore'
            target.mkdir()
            self.assertEqual(backup.extract_checked(archive, target)['tables'], ['messages'])
            with tarfile.open(archive, 'w:gz') as tar:
                member = tarfile.TarInfo('../outside')
                member.size = 1
                tar.addfile(member, io.BytesIO(b'x'))
            with self.assertRaises(ValueError):
                backup.extract_checked(archive, target)

    def test_restore_failure_cleans_test_database_without_touching_live_data(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = self.archive(folder)
            calls = []
            def psql(cfg, db, sql):
                calls.append((db, sql))
                return b''
            with patch.object(backup, 'psql', side_effect=psql), patch.object(
                    backup, 'run', side_effect=RuntimeError('Restore failed')):
                with self.assertRaises(RuntimeError):
                    backup.drill({'container': 'test'}, archive)
            self.assertTrue(calls[-1][1].startswith('DROP DATABASE lumen_restore_check_'))
            self.assertTrue(all(sql.startswith(('CREATE DATABASE ', 'DROP DATABASE '))
                                for db, sql in calls if db == 'postgres'))
            self.assertTrue(all(db.startswith('lumen_restore_check_')
                                for db, sql in calls if sql.startswith('TRUNCATE')))

    def test_retention_only_removes_own_archive_files(self):
        with tempfile.TemporaryDirectory() as folder:
            for i in range(9):
                Path(folder, f'lumen-{i:02}.tar.gz').write_bytes(b'backup')
            other = Path(folder, 'important.txt')
            other.write_text('keep')
            backup.prune(folder, 'lumen-*.tar.gz', 7)
            self.assertEqual(len(list(Path(folder).glob('lumen-*.tar.gz'))), 7)
            self.assertTrue(other.exists())


if __name__ == '__main__':
    unittest.main()
