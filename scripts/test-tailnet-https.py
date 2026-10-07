import importlib.util
from pathlib import Path
import tempfile
import tomllib
import unittest

spec = importlib.util.spec_from_file_location('configure', Path(__file__).with_name('configure-tailnet-https.py'))
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)
HOST = 'ailumen-llm-video.tail577ac1.ts.net'


class HTTPSConfig(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'backend').mkdir()
        (self.root/'supabase').mkdir()
        (self.root/'.env').write_text('EXPO_PUBLIC_SUPABASE_ANON_KEY=keep\nEXPO_PUBLIC_LUMEN_API_URL=http://old\n')
        (self.root/'backend/.env').write_text('SUPABASE_SERVICE_ROLE_KEY=private\nSUPPORT_ADMIN_USER_IDS=owner\nWEB_SEARCH_URL=http://127.0.0.1:8888\nLUMEN_CORS_ORIGINS=http://custom:8081\n')
        (self.root/'supabase/config.toml').write_text('[api]\nport=54321\n[auth]\nsite_url="http://old"\nadditional_redirect_urls=["http://old/login"]\n[auth.external.google]\nenabled=true\nredirect_uri="https://'+HOST+':8443/auth/v1/callback"\nsecret="env(GOOGLE_SECRET)"\n')

    def test_urls_and_existing_settings_preserved(self):
        changes = configure.prepare(self.root, HOST)
        self.assertIn('EXPO_PUBLIC_SUPABASE_ANON_KEY=keep', changes[self.root/'.env'])
        self.assertIn('EXPO_PUBLIC_SUPABASE_URL=https://'+HOST+':8445', changes[self.root/'.env'])
        server=changes[self.root/'backend/.env']
        for value in ['SUPABASE_SERVICE_ROLE_KEY=private','SUPPORT_ADMIN_USER_IDS=owner','WEB_SEARCH_URL=http://127.0.0.1:8888','http://custom:8081']:
            self.assertIn(value, server)
        self.assertIn('SUPPORT_RECOVERY_REDIRECT_URL=https://'+HOST+'/recover', server)
        config=tomllib.loads(changes[self.root/'supabase/config.toml'])
        self.assertEqual(config['api']['port'],54321)
        self.assertEqual(config['auth']['site_url'],'https://'+HOST)
        self.assertIn('http://old/login',config['auth']['additional_redirect_urls'])
        self.assertIn('https://'+HOST+'/login',config['auth']['additional_redirect_urls'])
        self.assertEqual(config['auth']['external']['google']['redirect_uri'],'https://'+HOST+':8443/auth/v1/callback')

    def test_repeated_configuration_is_idempotent(self):
        first=configure.prepare(self.root, HOST)
        for path, text in first.items():path.write_text(text)
        self.assertEqual(configure.prepare(self.root, HOST),first)

    def test_bad_hostname_rejected_before_writes(self):
        before=(self.root/'.env').read_text()
        for host in ['http://'+HOST,HOST+':443','example.com','host;command.tail123.ts.net']:
            with self.assertRaises(ValueError):configure.prepare(self.root,host)
        self.assertEqual((self.root/'.env').read_text(),before)

    def test_invalid_config_leaves_files_untouched(self):
        path=self.root/'supabase/config.toml'
        path.write_text('[auth]\nsite_url="old"\n')
        with self.assertRaises(KeyError):configure.prepare(self.root,HOST)
        self.assertEqual((self.root/'.env').read_text(),'EXPO_PUBLIC_SUPABASE_ANON_KEY=keep\nEXPO_PUBLIC_LUMEN_API_URL=http://old\n')

    def test_private_writes(self):
        path=self.root/'backend/new.env'
        configure.save_private(path,'secret')
        self.assertEqual(path.stat().st_mode & 0o777,0o600)
        self.assertEqual(path.read_text(),'secret')


if __name__ == '__main__':
    unittest.main()
