import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from pydantic import ValidationError
from types import SimpleNamespace
from lumen.auth import AuthUser
from lumen.push import Registration, Device, register, disable, test as send_test

D='33333333-3333-4333-8333-333333333333'
class PushRegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_uses_verified_user_token_and_enabled_choice(self):
        db=AsyncMock();user=AuthUser('verified-owner','verified-token')
        with patch('lumen.push.get_settings',return_value=SimpleNamespace(push_enabled=True)),patch('lumen.push.SupabaseRepository',return_value=db) as repo:
            await register(Registration(device_id=D,token='native-token-aaaaaaaaaaa',enabled=False),user)
        self.assertEqual(repo.call_args.args[1],'verified-token')
        self.assertFalse(db._request.call_args.kwargs['json']['p_enabled'])
        self.assertNotIn('owner_user_id',db._request.call_args.kwargs['json'])

    async def test_disabled_server_rejects_registration_but_allows_revocation(self):
        db=AsyncMock();user=AuthUser('owner','token')
        with patch('lumen.push.get_settings',return_value=SimpleNamespace(push_enabled=False)),patch('lumen.push.SupabaseRepository',return_value=db):
            with self.assertRaises(HTTPException) as error:
                await register(Registration(device_id=D,token='native-token-aaaaaaaaaaa'),user)
            self.assertEqual(error.exception.status_code,503)
            await disable(Device(device_id=D),user)
            self.assertEqual(db._request.call_args.args[1],'rpc/disable_push_device')

    async def test_provider_error_does_not_expose_token_or_sql(self):
        db=AsyncMock();db._request.side_effect=RuntimeError('private-token database details')
        with patch('lumen.push.get_settings',return_value=SimpleNamespace(push_enabled=True)),patch('lumen.push.SupabaseRepository',return_value=db):
            with self.assertRaises(HTTPException) as error: await send_test(Device(device_id=D),AuthUser('owner','token'))
        self.assertNotIn('private-token',error.exception.detail)

    def test_registration_requires_uuid_and_bounded_token(self):
        for payload in [{'device_id':'bad','token':'x'*30},{'device_id':D,'token':'short'},{'device_id':D,'token':'x'*4097}]:
            with self.assertRaises(ValidationError): Registration(**payload)
