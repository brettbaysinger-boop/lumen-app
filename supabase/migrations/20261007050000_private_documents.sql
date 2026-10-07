CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  companion_id uuid NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
  file_hash text NOT NULL CHECK(file_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK(kind IN ('pdf','text')),
  page_count integer NOT NULL CHECK(page_count BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(companion_id,file_hash)
);
CREATE TABLE public.document_pages (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page integer NOT NULL CHECK(page BETWEEN 1 AND 100),
  content text NOT NULL CHECK(length(content)<=50000),
  PRIMARY KEY(document_id,page)
);
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  page integer NOT NULL,
  position integer NOT NULL,
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig,content)) STORED,
  FOREIGN KEY(document_id,page) REFERENCES public.document_pages(document_id,page) ON DELETE CASCADE
);
CREATE INDEX document_chunks_search ON public.document_chunks USING gin(search_vector);
CREATE INDEX document_chunks_document ON public.document_chunks(document_id,page);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documents,public.document_pages,public.document_chunks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.documents,public.document_pages,public.document_chunks TO authenticated;
GRANT ALL ON public.documents,public.document_pages,public.document_chunks TO service_role;
CREATE POLICY documents_owner ON public.documents TO authenticated
  USING(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()))
  WITH CHECK(EXISTS(SELECT 1 FROM public.companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
CREATE POLICY document_pages_owner ON public.document_pages TO authenticated
  USING(EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id))
  WITH CHECK(EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id));
CREATE POLICY document_chunks_owner ON public.document_chunks TO authenticated
  USING(EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id))
  WITH CHECK(EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id));

-- Invoker rights keep the caller's RLS active; a single transaction prevents partial imports.
CREATE FUNCTION public.import_document(p_companion_id uuid,p_title text,p_hash text,p_kind text,p_pages jsonb)
RETURNS SETOF public.documents LANGUAGE plpgsql SET search_path='' AS $$
DECLARE doc public.documents; entry jsonb; body text; page_number integer; offset_pos integer; total integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions WHERE id=p_companion_id AND owner_user_id=auth.uid())
    THEN RAISE EXCEPTION 'Companion not found'; END IF;
  IF jsonb_typeof(p_pages)<>'array' OR jsonb_array_length(p_pages) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'Invalid page count'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_companion_id::text,0));
  SELECT * INTO doc FROM public.documents WHERE companion_id=p_companion_id AND file_hash=p_hash;
  IF FOUND THEN RETURN NEXT doc; RETURN; END IF;
  IF (SELECT count(*) FROM public.documents WHERE companion_id=p_companion_id)>=100
    THEN RAISE EXCEPTION 'Document limit reached'; END IF;
  INSERT INTO public.documents(companion_id,title,file_hash,kind,page_count)
    VALUES(p_companion_id,p_title,p_hash,p_kind,jsonb_array_length(p_pages)) RETURNING * INTO doc;
  page_number:=0;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_pages) LOOP
    page_number:=page_number+1;
    body:=entry->>'text';
    IF body IS NULL OR length(body)>50000 THEN RAISE EXCEPTION 'Invalid page text'; END IF;
    total:=total+length(body);
    IF total>1000000 THEN RAISE EXCEPTION 'Document too large'; END IF;
    INSERT INTO public.document_pages(document_id,page,content) VALUES(doc.id,page_number,body);
    offset_pos:=1;
    WHILE offset_pos<=length(body) LOOP
      INSERT INTO public.document_chunks(document_id,page,position,content)
        VALUES(doc.id,page_number,offset_pos,substring(body FROM offset_pos FOR 2000));
      offset_pos:=offset_pos+1800;
    END LOOP;
  END LOOP;
  IF total<10 THEN RAISE EXCEPTION 'No readable text'; END IF;
  RETURN NEXT doc;
END $$;

CREATE FUNCTION public.search_documents(p_companion_id uuid,p_query text)
RETURNS TABLE(document_id uuid,title text,page integer,content text,rank real)
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE query tsquery; terms text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.companions WHERE id=p_companion_id AND owner_user_id=auth.uid())
    THEN RAISE EXCEPTION 'Companion not found'; END IF;
  IF length(trim(p_query)) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'Invalid query'; END IF;
  SELECT string_agg(quote_literal(lexeme),' | ') INTO terms
    FROM unnest(tsvector_to_array(to_tsvector('english'::regconfig,p_query))) lexeme;
  IF terms IS NULL THEN RETURN; END IF;
  query:=to_tsquery('english'::regconfig,terms);
  RETURN QUERY SELECT d.id,d.title,c.page,c.content,ts_rank(c.search_vector,query)
    FROM public.document_chunks c JOIN public.documents d ON d.id=c.document_id
    WHERE d.companion_id=p_companion_id AND c.search_vector @@ query
    ORDER BY ts_rank(c.search_vector,query) DESC,d.created_at DESC,c.page,c.position LIMIT 5;
END $$;
REVOKE ALL ON FUNCTION public.import_document(uuid,text,text,text,jsonb),public.search_documents(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_document(uuid,text,text,text,jsonb),public.search_documents(uuid,text) TO authenticated;
