import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from lumen.auth import AuthUser
from lumen.portrait_creation import portrait_preview, PortraitRequest
from uuid import UUID

COMPANION = UUID('11111111-1111-4111-8111-111111111111')
USER = AuthUser(id='22222222-2222-4222-8222-222222222222', token='test')


class PortraitCreationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        settings_patch = patch('lumen.portrait_creation.get_settings', return_value=object())
        settings_patch.start(); self.addCleanup(settings_patch.stop)

    async def test_private_preview_uses_requested_appearance_without_updating_identity_or_chat(self):
        db = AsyncMock(); db.get_companion.return_value = {'id': str(COMPANION), 'visual_identity': 'Old look'}
        provider = AsyncMock(); provider.generate.return_value = {'bytes': b'png', 'mime_type': 'image/png'}
        with patch('lumen.portrait_creation.SupabaseRepository', return_value=db), patch(
                'lumen.portrait_creation.create_image_provider', return_value=provider):
            result = await portrait_preview(COMPANION, PortraitRequest(appearance='Silver hair', style='Anime'), USER)
        prompt = provider.generate.call_args.args[0]
        self.assertIn('Silver hair', prompt); self.assertIn('Anime', prompt); self.assertNotIn('Old look', prompt)
        self.assertTrue(result['path'].startswith(USER.id + '/'))
        self.assertEqual(db.upload_storage.call_args.args[0], 'companion-portraits')
        db.create_conversation.assert_not_called(); db.create_message.assert_not_called()

    async def test_unknown_or_other_owner_companion_never_reaches_generator(self):
        db = AsyncMock(); db.get_companion.return_value = None
        provider = AsyncMock()
        with patch('lumen.portrait_creation.SupabaseRepository', return_value=db), patch(
                'lumen.portrait_creation.create_image_provider', return_value=provider):
            with self.assertRaises(HTTPException) as caught:
                await portrait_preview(COMPANION, PortraitRequest(appearance='Silver hair'), USER)
        self.assertEqual(caught.exception.status_code, 404); provider.generate.assert_not_called()

    async def test_oversized_output_is_not_uploaded(self):
        db = AsyncMock(); db.get_companion.return_value = {'id': str(COMPANION)}
        provider = AsyncMock(); provider.generate.return_value = {'bytes': b'x' * (5 * 1024 * 1024 + 1), 'mime_type': 'image/png'}
        with patch('lumen.portrait_creation.SupabaseRepository', return_value=db), patch(
                'lumen.portrait_creation.create_image_provider', return_value=provider):
            with self.assertRaises(HTTPException):
                await portrait_preview(COMPANION, PortraitRequest(appearance='Silver hair'), USER)
        db.upload_storage.assert_not_called()
