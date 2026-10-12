
-- Runs only in a disposable database with synthetic rows and an auth.uid shim.
CREATE SCHEMA lumen_test;
CREATE TABLE lumen_test.checks(label text PRIMARY KEY);
CREATE TABLE lumen_test.state(key text PRIMARY KEY,value jsonb);
GRANT USAGE ON SCHEMA lumen_test TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE ON lumen_test.checks,lumen_test.state TO authenticated,anon;
CREATE FUNCTION lumen_test.check_true(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF;
 INSERT INTO lumen_test.checks VALUES(label);
END $$;
CREATE FUNCTION lumen_test.expect_error(statement text,expected_prefix text,label text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE actual text; caught boolean=false; BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
  IF left(actual,length(expected_prefix))<>expected_prefix THEN RAISE; END IF;
  caught:=true;
 END;
 PERFORM lumen_test.check_true(caught,label);
END $$;
CREATE FUNCTION lumen_test.unit_vector(axis integer) RETURNS real[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY(SELECT CASE WHEN i=axis THEN 1::real ELSE 0::real END FROM generate_series(1,768) i)
$$;


INSERT INTO public.profiles(id,display_name) VALUES ('11111111-1111-4111-8111-111111111111','Synthetic A'),('22222222-2222-4222-8222-222222222222','Synthetic B');
INSERT INTO public.companions(id,owner_user_id,name) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Synthetic first'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','Synthetic second'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','Synthetic other owner');
INSERT INTO public.conversations(id,companion_id,title) VALUES ('90000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic corrections');
INSERT INTO public.memories(id,companion_id,type,content,subject,source,tags,is_active,importance) VALUES
 ('10000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','semantic','The next step is measuring roof area.','user','explicit_user_request',ARRAY['topic:rainwater'],true,0.1),
 ('10000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','semantic','The user is considering a camera, not purchasing it.','user','conversation',ARRAY['topic:camera'],true,0.5),
 ('10000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','semantic','The companion prefers silver.','companion','conversation',ARRAY['topic:color'],true,0.5),
 ('10000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','semantic','An inactive synthetic memory.','user','conversation',ARRAY[]::text[],false,0.5),
 ('20000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','semantic','A low-priority older target.','user','conversation',ARRAY[]::text[],true,0.0),
 ('30000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','semantic','Another owner memory.','user','conversation',ARRAY[]::text[],true,0.5);
INSERT INTO lumen_test.state VALUES('before',(SELECT to_jsonb(m) FROM public.memories m WHERE id='10000000-0000-4000-8000-000000000001'));

RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT lumen_test.check_true(((SELECT count(*) FROM public.memory_embedding_profiles WHERE profile_id='91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800' AND dimensions=768)=1),'pinned profile present');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_pending_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',64))=3),'pending active same companion only');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'no embeddings gives no candidates');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='indexed'),'first version checked write');
SELECT lumen_test.check_true(((SELECT to_jsonb(m) FROM public.memories m WHERE id='10000000-0000-4000-8000-000000000001')=(SELECT value FROM lumen_test.state WHERE key='before')),'index does not mutate source row');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='already_indexed'),'idempotent write');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_pending_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',64))=2),'indexed source leaves pending work');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=1),'limit is maximum not quota');
SELECT lumen_test.check_true(((SELECT memory_id='10000000-0000-4000-8000-000000000001' AND similarity>0.999 FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),1))),'cosine candidate is correct');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,repeat('b',64),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='stale'),'wrong fingerprint refused');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',99,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='stale'),'wrong revision refused');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',ARRAY[1::real]) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','wrong dimensions rejected');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',NULL::real[]) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','null array rejected');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',array_fill(0::real,ARRAY[768])) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','zero vector rejected');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',array_fill(1::real,ARRAY[768])) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','non-normalized vector rejected');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',ARRAY[NULL::real]||array_fill(0::real,ARRAY[767])) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','null component rejected');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',ARRAY['NaN'::real]||array_fill(0::real,ARRAY[767])) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001'$bad$,'22','nan rejected');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),0)$bad$,'22','zero candidate limit rejected');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),65)$bad$,'22','large candidate limit rejected');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',lumen_test.unit_vector(1),6)$bad$,'22','unknown profile rejected');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('cccccccc-cccc-4ccc-8ccc-cccccccccccc','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6)$bad$,'42501','other owner candidates denied');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_pending_memory_embeddings('cccccccc-cccc-4ccc-8ccc-cccccccccccc','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',64)$bad$,'42501','other owner pending denied');
SELECT lumen_test.expect_error($bad$SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','30000000-0000-4000-8000-000000000001',0,repeat('a',64),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1))$bad$,'42501','cross companion memory write denied');
SELECT lumen_test.expect_error($bad$UPDATE public.memory_embeddings SET memory_revision=999 WHERE memory_id='10000000-0000-4000-8000-000000000001'$bad$,'42501','direct index mutation denied');
SELECT lumen_test.expect_error($bad$DELETE FROM public.memory_embeddings WHERE memory_id='10000000-0000-4000-8000-000000000001'$bad$,'42501','direct index deletion denied');
SELECT lumen_test.expect_error($bad$UPDATE public.memory_embedding_profiles SET dimensions=10$bad$,'42501','profile mutation denied');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'same owner different companion remains separate');

INSERT INTO lumen_test.state VALUES('receipt',public.correct_user_memory(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,
 'The next step is measuring roof area.','The next step is choosing a tank.',
 'correction','The next step is choosing a tank.'));

SELECT lumen_test.check_true(((SELECT count(*) FROM public.memory_embeddings)=0),'stale vector hidden by direct RLS after correction');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'corrected source excludes old vector');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',0,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='stale'),'old worker cannot label corrected memory');
INSERT INTO lumen_test.state VALUES('corrected',(SELECT to_jsonb(m) FROM public.memories m WHERE id='10000000-0000-4000-8000-000000000001'));
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='indexed'),'corrected revision indexed');
SELECT lumen_test.check_true(((SELECT to_jsonb(m) FROM public.memories m WHERE id='10000000-0000-4000-8000-000000000001')=(SELECT value FROM lumen_test.state WHERE key='corrected')),'corrected source unchanged by indexing');
SELECT public.undo_memory_correction((SELECT value->>'id' FROM lumen_test.state WHERE key='receipt')::uuid);
SELECT lumen_test.check_true(((SELECT content='The next step is measuring roof area.' AND revision_version=2 FROM public.memories WHERE id='10000000-0000-4000-8000-000000000001')),'actual correction Undo survives indexing');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'Undo makes corrected vector stale');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='indexed'),'restored version can be indexed');
UPDATE public.memories SET is_active=false WHERE id='10000000-0000-4000-8000-000000000001';
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'inactive source excluded');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='inactive'),'inactive indexing refused');
UPDATE public.memories SET is_active=true WHERE id='10000000-0000-4000-8000-000000000001';
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=0),'reactivation does not resurrect old vector');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='indexed'),'reactivated current revision indexed');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000002',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(2)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000002')='indexed'),'tentative source indexed without rewriting');
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000003',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(3)) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000003')='indexed'),'companion source indexed without reattribution');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6) WHERE memory_id='10000000-0000-4000-8000-000000000002' AND content LIKE '%not purchasing%' AND subject='user')=1),'negation preserved in candidate');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6) WHERE memory_id='10000000-0000-4000-8000-000000000003' AND subject='companion')=1),'subject preserved in candidate');
RESET ROLE;
INSERT INTO public.memory_embedding_profiles
 (profile_id,model_name,model_digest,dimensions,preprocessing,document_prefix,query_prefix,normalization,context_length)
 VALUES(repeat('b',64),'synthetic-only',repeat('c',64),2,'synthetic','d','q','l2',64);
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',ARRAY[1::real,0::real]) FROM public.memories m WHERE m.id='10000000-0000-4000-8000-000000000001')='indexed'),'alternate embedding space fixture');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6))=3),'mixed dimensions filtered before cosine');

DO $$ DECLARE i integer; mid uuid; BEGIN
 FOR i IN 1..505 LOOP
  mid:=md5('synthetic-noise-'||i)::uuid;
  INSERT INTO public.memories(id,companion_id,type,content,subject,importance)
  VALUES(mid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','semantic','Synthetic unrelated record '||i,'user',1);
  PERFORM public.lumen_store_memory_embedding('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',mid,0,
   public.lumen_memory_fingerprint('Synthetic unrelated record '||i,'user','conversation','{}'),
   '91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(2));
 END LOOP;
END $$;

SELECT lumen_test.check_true(((SELECT public.lumen_store_memory_embedding('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','20000000-0000-4000-8000-000000000001',m.revision_version,public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),'91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1)) FROM public.memories m WHERE m.id='20000000-0000-4000-8000-000000000001')='indexed'),'older low priority target indexed');
SELECT lumen_test.check_true(((SELECT memory_id='20000000-0000-4000-8000-000000000001' FROM public.lumen_match_memory_embeddings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),1))),'exact search reaches beyond 500 memories');
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT lumen_test.check_true(((SELECT count(*) FROM public.lumen_pending_memory_embeddings('cccccccc-cccc-4ccc-8ccc-cccccccccccc','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',64))=1),'second owner can see own pending memory');
SELECT lumen_test.check_true(((SELECT count(*) FROM public.memory_embeddings)=0),'second owner cannot select first owner vectors');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6)$bad$,'42501','second owner cannot call first owner search');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6)$bad$,'42501','anonymous search denied');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_pending_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',64)$bad$,'42501','anonymous pending denied');
SELECT lumen_test.expect_error($bad$SELECT * FROM public.memory_embeddings$bad$,'42501','anonymous direct vector read denied');
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','',false);
SELECT lumen_test.expect_error($bad$SELECT * FROM public.lumen_match_memory_embeddings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',lumen_test.unit_vector(1),6)$bad$,'42501','missing JWT subject denied');
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DELETE FROM public.memories WHERE id='10000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT lumen_test.check_true(((SELECT count(*) FROM public.memory_embeddings WHERE memory_id='10000000-0000-4000-8000-000000000001')=0),'source deletion physically cascades embeddings');
SELECT lumen_test.check_true((NOT has_table_privilege('authenticated','public.memory_embeddings','INSERT')),'no direct authenticated insert privilege');
SELECT lumen_test.check_true((NOT has_function_privilege('anon','public.lumen_store_memory_embedding(uuid,uuid,bigint,text,text,real[])','EXECUTE')),'anonymous write RPC ACL denied');
SELECT lumen_test.check_true((NOT has_function_privilege('service_role','public.lumen_store_memory_embedding(uuid,uuid,bigint,text,text,real[])','EXECUTE')),'service role not implicitly enabled as worker');
SELECT lumen_test.check_true(((SELECT format_type(atttypid,atttypmod) LIKE '%vector(1536)' FROM pg_attribute WHERE attrelid='public.memories'::regclass AND attname='embedding')),'legacy vector column unchanged');
SELECT 'LUMEN_SQL_RESULT='||json_build_object('checks_passed',(SELECT count(*) FROM lumen_test.checks),'postgres_version',current_setting('server_version'),'vector_version',(SELECT extversion FROM pg_extension WHERE extname='vector'),'vector_schema',(SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector'))::text;
