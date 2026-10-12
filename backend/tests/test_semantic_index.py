"""Offline contract tests. SQL authorization is tested separately in PostgreSQL."""
import asyncio
import copy
import math
import unittest
from unittest.mock import AsyncMock

from lumen.semantic_index import (
    IndexContractError, MODEL, PROFILE, PROFILE_ID, Snapshot,
    SemanticIndex, document_input, query_input, normalize_vector,
)

CID = '11111111-1111-4111-8111-111111111111'
MID = '22222222-2222-4222-8222-222222222222'
OTHER = '33333333-3333-4333-8333-333333333333'


def row(**changes):
    value = dict(memory_id=MID, companion_id=CID, revision=3, fingerprint='a'*64,
                 content='The user is considering a camera and has not bought it.',
                 subject='user', source='user_reported', tags=['topic:camera'])
    return {**value, **changes}


def vector():
    return [1.0] + [0.0]*767


class ContractTests(unittest.TestCase):
    def test_profile_matches_actual_embedding_trial(self):
        self.assertEqual(PROFILE_ID, '91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800')

    def test_normalized_vector(self):
        v = normalize_vector([2.0]+[0.0]*767)
        self.assertEqual(v, vector())

    def test_wrong_dimensions_rejected(self):
        for v in ([], [1.0], [1.0]*1536):
            with self.subTest(size=len(v)), self.assertRaises(IndexContractError):
                normalize_vector(v)

    def test_non_numeric_rejected(self):
        for bad in (True, '1', None):
            with self.subTest(value=bad), self.assertRaises(IndexContractError):
                normalize_vector([bad]+[0.0]*767)

    def test_nonfinite_rejected(self):
        for bad in (math.nan, math.inf, -math.inf):
            with self.subTest(value=bad), self.assertRaises(IndexContractError):
                normalize_vector([bad]+[0.0]*767)

    def test_overflow_rejected(self):
        with self.assertRaises(IndexContractError):
            normalize_vector([10**1000]+[0.0]*767)

    def test_zero_rejected(self):
        with self.assertRaises(IndexContractError):
            normalize_vector([0.0]*768)

    def test_vector_not_mutated(self):
        v = [2.0]+[0.0]*767
        before = list(v)
        normalize_vector(v)
        self.assertEqual(v, before)

    def test_document_wording_preserved(self):
        text = row()['content']
        self.assertEqual(document_input(text, []), 'search_document: '+text)

    def test_topics_sorted_deduplicated(self):
        self.assertEqual(document_input('text', ['topic:z_z','unused','topic:a','topic:a']),
                         'search_document: text\nTopics: a; z z')

    def test_document_bounds(self):
        for text in ('', '  ', 'x'*4001, 'x\x00'):
            with self.subTest(text_length=len(text)), self.assertRaises(IndexContractError):
                document_input(text, [])

    def test_invalid_tags(self):
        for tags in ('topic:test', [None], ['\x00']):
            with self.assertRaises(IndexContractError):
                document_input('text', tags)

    def test_query_prefix(self):
        self.assertEqual(query_input('  Which camera?  '), 'search_query: Which camera?')

    def test_query_bounds(self):
        for q in ('', ' '*10, 'a'*2001, 'a\x00'):
            with self.assertRaises(IndexContractError):
                query_input(q)

    def test_snapshot_preserves_attribution(self):
        r = row(subject='companion')
        s = Snapshot.read(r, CID)
        self.assertEqual(s.subject, 'companion')
        self.assertEqual(s.content, r['content'])

    def test_snapshot_requires_revision_and_fingerprint(self):
        for changes in ({'revision': None}, {'revision': True}, {'revision': -1},
                        {'fingerprint': 'wrong'}, {'fingerprint': None}):
            with self.assertRaises(IndexContractError):
                Snapshot.read(row(**changes), CID)

    def test_wrong_companion_rejected(self):
        with self.assertRaises(IndexContractError):
            Snapshot.read(row(companion_id=OTHER), CID)

    def test_bad_identity_rejected(self):
        with self.assertRaises(IndexContractError):
            Snapshot.read(row(memory_id='private-text-not-a-uuid'), CID)

    def test_snapshot_not_mutated(self):
        r = row()
        before = copy.deepcopy(r)
        Snapshot.read(r, CID).document()
        self.assertEqual(r, before)

    def test_invalid_subject_rejected(self):
        with self.assertRaises(IndexContractError):
            Snapshot.read(row(subject='invented'), CID)


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    def adapter(self, result):
        db = AsyncMock()
        db._request.return_value = result
        return SemanticIndex(db), db

    async def test_pending_is_explicit_rpc(self):
        adapter, db = self.adapter([row()])
        result = await adapter.pending(CID)
        self.assertEqual(result[0].memory_id, MID)
        self.assertEqual(db._request.call_args.args, ('POST', 'rpc/lumen_pending_memory_embeddings'))
        self.assertEqual(db._request.call_args.kwargs['json']['p_profile'], PROFILE_ID)

    async def test_pending_empty(self):
        a, _ = self.adapter([])
        self.assertEqual(await a.pending(CID), [])

    async def test_pending_duplicate_refused(self):
        a, _ = self.adapter([row(), row()])
        with self.assertRaises(IndexContractError):
            await a.pending(CID)

    async def test_invalid_limit_no_io(self):
        for bad in (0, 65, True, -1):
            a, db = self.adapter([])
            with self.assertRaises(IndexContractError):
                await a.pending(CID, limit=bad)
            db._request.assert_not_awaited()

    async def test_store_preserves_source_version(self):
        a, db = self.adapter('indexed')
        snap = Snapshot.read(row(), CID)
        self.assertEqual(await a.store(snap, vector(), model_digest=PROFILE['model_digest']), 'indexed')
        payload = db._request.call_args.kwargs['json']
        self.assertEqual(payload['p_revision'], 3)
        self.assertEqual(payload['p_fingerprint'], 'a'*64)
        self.assertNotIn('content', payload)
        self.assertEqual(db._request.call_args.args[1], 'rpc/lumen_store_memory_embedding')

    async def test_stale_and_inactive_not_called_success(self):
        for result in ('stale', 'inactive', 'already_indexed'):
            a, _ = self.adapter(result)
            self.assertEqual(await a.store(Snapshot.read(row(), CID), vector(),
                                           model_digest=PROFILE['model_digest']), result)

    async def test_unexpected_receipt_refused(self):
        a, _ = self.adapter('saved and corrected')
        with self.assertRaises(IndexContractError):
            await a.store(Snapshot.read(row(), CID), vector(), model_digest=PROFILE['model_digest'])

    async def test_wrong_model_no_io(self):
        a, db = self.adapter([])
        with self.assertRaises(IndexContractError):
            await a.store(Snapshot.read(row(), CID), vector(), model_digest='b'*64)
        db._request.assert_not_awaited()

    async def test_candidates_are_not_thresholded(self):
        supplied = row(similarity=-0.1)
        a, db = self.adapter([supplied])
        self.assertEqual(await a.candidates(CID, vector(), model_digest=PROFILE['model_digest']), [supplied])
        self.assertEqual(db._request.call_args.args[1], 'rpc/lumen_match_memory_embeddings')

    async def test_candidate_foreign_owner_data_refused(self):
        a, _ = self.adapter([row(companion_id=OTHER, similarity=1.0)])
        with self.assertRaises(IndexContractError):
            await a.candidates(CID, vector(), model_digest=PROFILE['model_digest'])

    async def test_candidate_bad_scores_refused(self):
        for score in (math.nan, math.inf, 2.0, True, None):
            a, _ = self.adapter([row(similarity=score)])
            with self.assertRaises(IndexContractError):
                await a.candidates(CID, vector(), model_digest=PROFILE['model_digest'])

    async def test_network_error_not_reported_as_empty_memory(self):
        a, db = self.adapter([])
        db._request.side_effect = RuntimeError('unavailable')
        with self.assertRaises(RuntimeError):
            await a.pending(CID)

    async def test_no_mutation_at_constructor(self):
        _, db = self.adapter([])
        db._request.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
