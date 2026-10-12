-- Additive search-data foundation. No live chat route, backfill, or source-memory
-- updates. One DO statement makes all new objects and ACLs atomic. The vector
-- extension must already exist; its namespace is discovered, never relocated.
DO $migration$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO vs FROM pg_catalog.pg_extension e
 JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 IF vs IS NULL THEN RAISE EXCEPTION 'Installed vector extension required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.memories'::regclass AND attname='revision_version' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'Memory revision migration required'; END IF;

 CREATE TABLE public.memory_embedding_profiles (
  profile_id text PRIMARY KEY CHECK(profile_id ~ '^[0-9a-f]{64}$'),
  model_name text NOT NULL,
  model_digest text NOT NULL CHECK(model_digest ~ '^[0-9a-f]{64}$'),
  dimensions integer NOT NULL CHECK(dimensions BETWEEN 1 AND 4096),
  preprocessing text NOT NULL,
  document_prefix text NOT NULL,
  query_prefix text NOT NULL,
  normalization text NOT NULL CHECK(normalization='l2'),
  context_length integer NOT NULL CHECK(context_length>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,dimensions)
 );
 ALTER TABLE public.memory_embedding_profiles ENABLE ROW LEVEL SECURITY;
 CREATE POLICY embedding_profile_read ON public.memory_embedding_profiles
  FOR SELECT TO authenticated USING(true);
 REVOKE ALL ON public.memory_embedding_profiles FROM PUBLIC,anon,authenticated,service_role;
 GRANT SELECT ON public.memory_embedding_profiles TO authenticated;
 INSERT INTO public.memory_embedding_profiles
  (profile_id,model_name,model_digest,dimensions,preprocessing,document_prefix,
   query_prefix,normalization,context_length)
 VALUES('91537d23c023cb83235b45dc4c5599de8ae1977810deb526d531a2d39bf91800',
  'nomic-embed-text:v1.5','0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f',
  768,'lumen-memory-content-topic-v1','search_document: ','search_query: ','l2',2048);

 EXECUTE $ddl$
 CREATE FUNCTION public.lumen_memory_fingerprint(p_content text,p_subject text,p_source text,p_tags text[])
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_content,p_subject,p_source,p_tags)::text,'UTF8')),'hex')
 $fn$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.lumen_memory_fingerprint(text,text,text,text[])
  FROM PUBLIC,anon,service_role;
 GRANT EXECUTE ON FUNCTION public.lumen_memory_fingerprint(text,text,text,text[]) TO authenticated;

 EXECUTE format($ddl$
 CREATE TABLE public.memory_embeddings (
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  profile_id text NOT NULL,
  dimensions integer NOT NULL,
  memory_revision bigint NOT NULL CHECK(memory_revision>=0),
  source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[0-9a-f]{64}$'),
  embedding %1$I.vector NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(memory_id,profile_id),
  FOREIGN KEY(profile_id,dimensions) REFERENCES public.memory_embedding_profiles(profile_id,dimensions),
  CHECK(%1$I.vector_dims(embedding)=dimensions),
  CHECK(%1$I.vector_norm(embedding) BETWEEN 0.999 AND 1.001)
 );
 $ddl$,vs);
 CREATE INDEX memory_embeddings_companion_profile ON public.memory_embeddings(companion_id,profile_id);
 ALTER TABLE public.memory_embeddings ENABLE ROW LEVEL SECURITY;
 -- Direct SELECT cannot expose a stale/deleted/reassigned memory's derived data.
 CREATE POLICY memory_embedding_read ON public.memory_embeddings
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.memories m JOIN public.companions c ON c.id=m.companion_id
  WHERE m.id=memory_id AND m.companion_id=memory_embeddings.companion_id
   AND c.owner_user_id=(SELECT auth.uid()) AND m.is_active
   AND m.revision_version=memory_revision
   AND public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags)=source_fingerprint
 ));
 REVOKE ALL ON public.memory_embeddings FROM PUBLIC,anon,authenticated,service_role;
 GRANT SELECT ON public.memory_embeddings TO authenticated;

 EXECUTE $ddl$
 CREATE FUNCTION public.lumen_pending_memory_embeddings(p_companion uuid,p_profile text,p_limit integer DEFAULT 32)
 RETURNS TABLE(memory_id uuid,companion_id uuid,revision bigint,fingerprint text,
               content text,subject text,source text,tags text[])
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c
    WHERE c.id=p_companion AND c.owner_user_id=auth.uid())
  THEN RAISE EXCEPTION 'Companion unavailable' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 64 OR NOT EXISTS(
    SELECT 1 FROM public.memory_embedding_profiles p WHERE p.profile_id=p_profile)
  THEN RAISE EXCEPTION 'Invalid index request' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT m.id,m.companion_id,m.revision_version,
   public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags),m.content,m.subject,m.source,m.tags
  FROM public.memories m
  WHERE m.companion_id=p_companion AND m.is_active AND NOT EXISTS(
   SELECT 1 FROM public.memory_embeddings e WHERE e.memory_id=m.id AND e.profile_id=p_profile
    AND e.companion_id=m.companion_id AND e.memory_revision=m.revision_version
    AND e.source_fingerprint=public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags))
  ORDER BY m.id LIMIT p_limit;
 END $fn$;
 $ddl$;

 EXECUTE format($ddl$
 CREATE FUNCTION public.lumen_store_memory_embedding(p_companion uuid,p_memory uuid,
  p_revision bigint,p_fingerprint text,p_profile text,p_values real[])
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
 DECLARE m public.memories; dims integer; v %1$I.vector; saved integer;
 BEGIN
  -- Same lock order as corrections: companion first, then source memory.
  -- SHARE blocks UPDATE/DELETE until this transaction completes, without writing.
  PERFORM 1 FROM public.companions c
   WHERE c.id=p_companion AND c.owner_user_id=auth.uid() FOR SHARE;
  IF auth.uid() IS NULL OR NOT FOUND
  THEN RAISE EXCEPTION 'Companion unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.memories x WHERE x.id=p_memory AND x.companion_id=p_companion FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Memory unavailable' USING ERRCODE='42501'; END IF;
  IF m.is_active IS DISTINCT FROM true THEN RETURN 'inactive'; END IF;
  IF p_revision IS NULL OR m.revision_version<>p_revision OR p_fingerprint IS DISTINCT FROM
   public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags)
  THEN RETURN 'stale'; END IF;
  SELECT p.dimensions INTO dims FROM public.memory_embedding_profiles p WHERE p.profile_id=p_profile;
  IF dims IS NULL OR p_values IS NULL OR array_ndims(p_values) IS DISTINCT FROM 1 OR
    cardinality(p_values)<>dims OR array_position(p_values,NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'Invalid embedding shape' USING ERRCODE='22023'; END IF;
  v := p_values::%1$I.vector;
  IF NOT (%1$I.vector_norm(v) BETWEEN 0.999 AND 1.001)
  THEN RAISE EXCEPTION 'Expected finite normalized embedding' USING ERRCODE='22023'; END IF;
  INSERT INTO public.memory_embeddings AS old
    (memory_id,companion_id,profile_id,dimensions,memory_revision,source_fingerprint,embedding)
  VALUES(m.id,m.companion_id,p_profile,dims,m.revision_version,p_fingerprint,v)
  ON CONFLICT(memory_id,profile_id) DO UPDATE SET
   companion_id=EXCLUDED.companion_id,dimensions=EXCLUDED.dimensions,
   memory_revision=EXCLUDED.memory_revision,source_fingerprint=EXCLUDED.source_fingerprint,
   embedding=EXCLUDED.embedding,indexed_at=clock_timestamp()
  WHERE old.memory_revision IS DISTINCT FROM EXCLUDED.memory_revision
    OR old.source_fingerprint IS DISTINCT FROM EXCLUDED.source_fingerprint
    OR old.companion_id IS DISTINCT FROM EXCLUDED.companion_id;
  GET DIAGNOSTICS saved=ROW_COUNT;
  RETURN CASE WHEN saved=0 THEN 'already_indexed' ELSE 'indexed' END;
 END $fn$;
 $ddl$,vs);

 EXECUTE format($ddl$
 CREATE FUNCTION public.lumen_match_memory_embeddings(p_companion uuid,p_profile text,
  p_values real[],p_limit integer DEFAULT 12)
 RETURNS TABLE(memory_id uuid,companion_id uuid,revision bigint,fingerprint text,
  content text,subject text,source text,tags text[],occurred_at timestamptz,
  created_at timestamptz,updated_at timestamptz,similarity double precision)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 DECLARE dims integer; q %1$I.vector;
 BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions c
   WHERE c.id=p_companion AND c.owner_user_id=auth.uid())
  THEN RAISE EXCEPTION 'Companion unavailable' USING ERRCODE='42501'; END IF;
  SELECT p.dimensions INTO dims FROM public.memory_embedding_profiles p WHERE p.profile_id=p_profile;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 64 OR dims IS NULL OR p_values IS NULL
   OR array_ndims(p_values) IS DISTINCT FROM 1 OR cardinality(p_values)<>dims
   OR array_position(p_values,NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'Invalid candidate query' USING ERRCODE='22023'; END IF;
  q := p_values::%1$I.vector;
  IF NOT (%1$I.vector_norm(q) BETWEEN 0.999 AND 1.001)
  THEN RAISE EXCEPTION 'Expected finite normalized query' USING ERRCODE='22023'; END IF;
  -- Materialize authorized CURRENT rows in the requested embedding space BEFORE
  -- distance computation and top-k. No importance-first 500-memory prefilter.
  RETURN QUERY WITH eligible AS MATERIALIZED (
   SELECT m.id,m.companion_id,m.revision_version,e.source_fingerprint,m.content,
    m.subject,m.source,m.tags,m.occurred_at,m.created_at,m.updated_at,e.embedding
   FROM public.memories m JOIN public.companions c ON c.id=m.companion_id
   JOIN public.memory_embeddings e ON e.memory_id=m.id AND e.companion_id=m.companion_id
   WHERE c.owner_user_id=auth.uid() AND m.companion_id=p_companion AND m.is_active
    AND e.profile_id=p_profile AND e.dimensions=dims AND e.memory_revision=m.revision_version
    AND e.source_fingerprint=public.lumen_memory_fingerprint(m.content,m.subject,m.source,m.tags)
  ) SELECT e.id,e.companion_id,e.revision_version,e.source_fingerprint,e.content,e.subject,
    e.source,e.tags,e.occurred_at,e.created_at,e.updated_at,
    1.0-(e.embedding OPERATOR(%1$I.<=>) q)
   FROM eligible e ORDER BY (e.embedding OPERATOR(%1$I.<=>) q),e.id LIMIT p_limit;
 END $fn$;
 $ddl$,vs);

 REVOKE ALL ON FUNCTION public.lumen_pending_memory_embeddings(uuid,text,integer),
  public.lumen_store_memory_embedding(uuid,uuid,bigint,text,text,real[]),
  public.lumen_match_memory_embeddings(uuid,text,real[],integer) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION public.lumen_pending_memory_embeddings(uuid,text,integer),
  public.lumen_store_memory_embedding(uuid,uuid,bigint,text,text,real[]),
  public.lumen_match_memory_embeddings(uuid,text,real[],integer) TO authenticated;
END $migration$;
