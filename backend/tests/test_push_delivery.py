import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from lumen.push_worker import classify, message, deliver

class PushDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def job(self):
        return dict(id='job',claim_id='claim',device_id='device',owner_user_id='owner',token='secret-device-token',kind='reminder',item_id='item',due_at='2026-10-11T14:00:00+00:00')

    def test_payload_has_no_reminder_content_and_stable_tag(self):
        job={**self.job(),'title':'Private medical appointment','body':'Private notes'}
        payload=message(job)['message']
        self.assertNotIn('Private',str(payload))
        self.assertEqual(payload['android']['notification']['tag'],'job')
        self.assertEqual(payload['data']['screen'],'my-day')

    def test_fcm_outcomes(self):
        self.assertEqual(classify(200,{}),'sent')
        self.assertEqual(classify(404,{'error':{'details':[{'errorCode':'UNREGISTERED'}]}}),'invalid')
        for status in [429,500,503,401]: self.assertEqual(classify(status,{}),'retry')
        self.assertEqual(classify(403,{}),'failed')
        self.assertEqual(classify(400,{}),'failed')

    async def test_disabled_or_rotated_device_is_not_sent(self):
        for rows in [[],[dict(token='new-token',expires_at='2099-01-01T00:00:00Z')]]:
            db=AsyncMock();db._request.side_effect=[rows,True];sender=AsyncMock()
            await deliver(db,sender,self.job());sender.send.assert_not_called()
            self.assertEqual(db._request.call_args.kwargs['json']['p_result'],'cancelled')

    async def test_changed_reminder_is_not_sent(self):
        db=AsyncMock();db._request.side_effect=[[dict(token='secret-device-token',expires_at='2099-01-01T00:00:00Z')],[],True]
        sender=AsyncMock();await deliver(db,sender,self.job());sender.send.assert_not_called()

    async def test_network_failure_is_retryable_without_leaking_provider_error(self):
        db=AsyncMock();db._request.side_effect=[[dict(token='secret-device-token',expires_at='2099-01-01T00:00:00Z')],[dict(id='item',companion_id='companion')],True]
        db.get_companion.return_value={'owner_user_id':'owner'}
        sender=AsyncMock();sender.send.side_effect=RuntimeError('secret provider body')
        await deliver(db,sender,self.job())
        self.assertEqual(db._request.call_args.kwargs['json']['p_result'],'retry')
