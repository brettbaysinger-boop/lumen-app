import unittest
from unittest.mock import patch
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.config import Settings
from lumen.support import router

A='11111111-1111-4111-8111-111111111111'
U='22222222-2222-4222-8222-222222222222'

class SupportRoutes(unittest.TestCase):
    def setUp(self):
        app=FastAPI(); app.include_router(router)
        self.user=AuthUser(A,'admin-session')
        app.dependency_overrides[require_user]=lambda:self.user
        self.client=TestClient(app); self.addCleanup(self.client.close)
        self.settings=Settings(supabase_url='http://db',supabase_service_role_key='server-secret',
            support_admin_user_ids=A,support_recovery_redirect_url='http://localhost:8081/recover')
        p=patch('lumen.support.get_settings',return_value=self.settings);p.start();self.addCleanup(p.stop)

    def upstream(self,handler):
        original=httpx.AsyncClient
        return patch('lumen.support.httpx.AsyncClient',side_effect=lambda **kw:original(transport=httpx.MockTransport(handler),**kw))

    def test_ordinary_user_cannot_list_or_act_even_with_profile_admin_claim(self):
        self.user=AuthUser(U,'ordinary-session')
        with patch('lumen.support.httpx.AsyncClient') as client:
            for method,path in [('GET','accounts'),('GET','audit'),('POST',f'accounts/{A}/unlock'),('POST',f'accounts/{A}/recovery')]:
                self.assertEqual(self.client.request(method,'/v0.4/support/'+path).status_code,403)
            client.assert_not_called()
        self.assertEqual(self.client.get('/v0.4/support/me').json(),{'enabled':False,'user_id':U})

    def test_account_response_is_projected_not_auth_metadata(self):
        row={'id':U,'email':'user@example.test','user_metadata':{'private':'secret'},'identities':['hidden'],
             'app_metadata':{'role':'admin'},'recovery_token':'never-return','password':'never-return'}
        with self.upstream(lambda req:httpx.Response(200,json={'users':[row]})):
            data=self.client.get('/v0.4/support/accounts').json()['accounts'][0]
        self.assertEqual(set(data),{'id','email','created_at','last_sign_in_at','email_confirmed_at','banned_until'})
        self.assertNotIn('secret',str(data));self.assertNotIn('never-return',str(data))

    def test_unlock_has_narrow_payload_and_audit_precedes_change(self):
        requests=[]
        def handler(req):
            import json
            requests.append((req.method,req.url.path,json.loads(req.content) if req.content else None))
            self.assertEqual(req.headers['authorization'],'Bearer server-secret')
            if req.method=='GET':return httpx.Response(200,json={'id':U,'email':'user@example.test'})
            return httpx.Response(200,json={'recovery_token':'not-forwarded'})
        with self.upstream(handler): response=self.client.post(f'/v0.4/support/accounts/{U}/unlock')
        self.assertEqual(response.status_code,200)
        self.assertEqual([r[1] for r in requests],[f'/auth/v1/admin/users/{U}','/rest/v1/support_audit',f'/auth/v1/admin/users/{U}','/rest/v1/support_audit'])
        self.assertEqual(requests[2][2],{'ban_duration':'none'})
        self.assertEqual(requests[1][2]['actor_user_id'],A)
        self.assertEqual(requests[-1][2]['status'],'accepted')
        self.assertNotIn('not-forwarded',response.text)

    def test_recovery_sends_email_without_generating_or_returning_link(self):
        calls=[]
        def handler(req):
            calls.append(req)
            if req.method=='GET': return httpx.Response(200,json={'id':U,'email':'user@example.test'})
            return httpx.Response(200,json={'action_link':'SECRET-LINK'})
        with self.upstream(handler): response=self.client.post(f'/v0.4/support/accounts/{U}/recovery')
        self.assertEqual(response.status_code,200)
        self.assertEqual(calls[2].url.path,'/auth/v1/recover')
        self.assertEqual(calls[2].url.params['redirect_to'],'http://localhost:8081/recover')
        self.assertNotIn('SECRET-LINK',response.text)

    def test_audit_failure_prevents_account_change(self):
        paths=[]
        def handler(req):
            paths.append(req.url.path)
            return httpx.Response(200,json={'id':U,'email':'user@example.test'}) if req.method=='GET' else httpx.Response(500)
        with self.upstream(handler): response=self.client.post(f'/v0.4/support/accounts/{U}/unlock')
        self.assertEqual(response.status_code,503)
        self.assertEqual(paths,[f'/auth/v1/admin/users/{U}','/rest/v1/support_audit'])

    def test_recovery_configuration_required_and_no_privilege_edit_route(self):
        self.settings.support_recovery_redirect_url=''
        with self.upstream(lambda req:httpx.Response(200,json={'id':U,'email':'user@example.test'})):
            self.assertEqual(self.client.post(f'/v0.4/support/accounts/{U}/recovery').status_code,503)
        self.assertEqual(self.client.post(f'/v0.4/support/accounts/{U}/password',json={'password':'known-to-admin'}).status_code,404)

    def test_no_session_cannot_access_support(self):
        app=FastAPI();app.include_router(router)
        with TestClient(app) as client:self.assertEqual(client.get('/v0.4/support/accounts').status_code,401)

    def test_failed_action_is_audited_without_success_claim(self):
        import json
        statuses=[]
        def handler(req):
            if req.method=='GET':return httpx.Response(200,json={'id':U,'email':'user@example.test'})
            if req.method=='PUT':return httpx.Response(500)
            if req.method=='PATCH':statuses.append(json.loads(req.content)['status'])
            return httpx.Response(200,json={})
        with self.upstream(handler):response=self.client.post(f'/v0.4/support/accounts/{U}/unlock')
        self.assertEqual(response.status_code,503)
        self.assertEqual(statuses,['failed'])

    def test_audit_completion_failure_reports_accepted_action(self):
        def handler(req):
            if req.method=='GET':return httpx.Response(200,json={'id':U,'email':'user@example.test'})
            return httpx.Response(500) if req.method=='PATCH' else httpx.Response(200,json={})
        with self.upstream(handler):response=self.client.post(f'/v0.4/support/accounts/{U}/unlock')
        self.assertEqual(response.status_code,503)
        self.assertIn('action was accepted',response.json()['detail'])
