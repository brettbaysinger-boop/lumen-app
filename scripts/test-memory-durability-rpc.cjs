// Phase 1b: execute real memory migrations inside isolated PGlite.
// No connection to production Supabase, filesystem modifications, or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const M1 = '11111111-0000-4000-8000-000000000001';
const M2 = '11111111-0000-4000-8000-000000000002';
const M3 = '11111111-0000-4000-8000-000000000003';
const M4 = '11111111-0000-4000-8000-000000000004';
const M5 = '11111111-0000-4000-8000-000000000005';
const M6 = '11111111-0000-4000-8000-000000000006';
const M7 = '11111111-0000-4000-8000-000000000007';
const M8 = '11111111-0000-4000-8000-000000000008';
const M9 = '11111111-0000-4000-8000-000000000009';
const S1 = '22222222-0000-4000-8000-000000000001';
const S2 = '22222222-0000-4000-8000-000000000002';
const S3 = '22222222-0000-4000-8000-000000000003';
const S4 = '22222222-0000-4000-8000-000000000004';
const S5 = '22222222-0000-4000-8000-000000000005';
const S6 = '22222222-0000-4000-8000-000000000006';
const S7 = '22222222-0000-4000-8000-000000000007';
const S8 = '22222222-0000-4000-8000-000000000008';
const S9 = '22222222-0000-4000-8000-000000000009';

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role WITH BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      CREATE TABLE public.companions (
        id uuid PRIMARY KEY, owner_user_id uuid, name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.conversations (
        id uuid PRIMARY KEY, companion_id uuid NOT NULL REFERENCES public.companions(id)
      );
      CREATE TABLE public.messages (
        id uuid PRIMARY KEY, companion_id uuid NOT NULL REFERENCES public.companions(id),
        conversation_id uuid REFERENCES public.conversations(id),
        role text NOT NULL, content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.memories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        companion_id uuid NOT NULL REFERENCES public.companions(id),
        conversation_id uuid REFERENCES public.conversations(id),
        type text NOT NULL, content text NOT NULL, subject text NOT NULL,
        importance real DEFAULT 0.5, confidence real DEFAULT 0.8,
        source text, tags text[] DEFAULT '{}',
        revision_version bigint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY companions_owner ON public.companions TO authenticated
        USING(owner_user_id=auth.uid()) WITH CHECK(owner_user_id=auth.uid());
      GRANT SELECT ON public.companions TO authenticated;
      ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
      CREATE POLICY memories_owner_read ON public.memories FOR SELECT TO authenticated
        USING(EXISTS(SELECT 1 FROM public.companions c
          WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
      GRANT SELECT ON public.memories TO authenticated;
    `);
    for (const file of [
      'supabase/migrations/20261004120000_memory_suggestions.sql',
      'supabase/migrations/20261005020000_automatic_memory.sql',
      'supabase/migrations/20261012090000_memory_quality_guardrails.sql',
      'supabase/migrations/20261012233000_memory_durability_review_guard.sql',
    ]) {
      await db.exec(fs.readFileSync(file, 'utf8'));
    }

    async function admin() {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
    }
    async function as(role, owner = '') {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);
      await db.exec(`SET ROLE ${role}`);
    }
    async function scalar(sql, params = []) {
      const result = await db.query(sql,params);
      if (result.rows.length !== 1) throw new Error('Expected one row');
      return Object.values(result.rows[0])[0];
    }
    async function proposal(sid, mid, cid, content, evidence, subject = 'user') {
      await admin();
      await db.query(`INSERT INTO public.messages(id,companion_id,role,content)
        VALUES($1,$2,'user',$3)`,[mid,cid,evidence]);
      await db.query(`INSERT INTO public.memory_suggestions
        (id,companion_id,source_message_id,content,evidence,subject,type)
        VALUES($1,$2,$3,$4,$5,$6,'preference')`,[sid,cid,mid,content,evidence,subject]);
    }

    await admin();
    for (const [cid,uid,name] of [[C1,A,'Nova'],[C2,B,'Atlas'],[C3,A,'Aria']]) {
      await db.query('INSERT INTO public.companions(id,owner_user_id,name) VALUES($1,$2,$3)',[cid,uid,name]);
    }
    const records = [
      [S1,M1,C1,'The user likes silly jokes.','Tell me a silly joke.','user'],
      [S2,M2,C1,'The user prefers turquoise.','My favorite color is turquoise.','user'],
      [S3,M3,C2,'The user prefers green.','My favorite color is green.','user'],
      [S4,M4,C1,'The user identifies as the creator.','Did you know I am your creator?','user'],
      [S5,M5,C1,'The user asked Nova to call them captain.','Will you call me captain?','user'],
      [S6,M6,C3,'The user prefers blue.','My favorite color is blue.','user'],
      [S7,M7,C1,'The user likes coffee.','My favorite coffee is espresso.','companion'],
      [S8,M8,C1,'The user wants to remember a joke.','Please remember that I like jokes.','user'],
      [S9,M9,C1,'The user likes gardening.','This source does not contain that evidence.','user'],
    ];
    for (const row of records) await proposal(...row);
    // Corrupt the ninth suggestion's evidence, deliberately, after insertion.
    await admin();
    await db.query('UPDATE public.memory_suggestions SET evidence=$1 WHERE id=$2',[
      'a quote that is not in source', S9,
    ]);

    const legacy = `SELECT public.review_memory_suggestion($1::uuid,'approve',NULL,NULL)`;
    const confirmed = `SELECT public.review_memory_suggestion_v2($1::uuid,'approve',NULL,NULL,$2::boolean)`;
    const auto = `SELECT public.auto_save_memory_suggestion($1::uuid,'favorite_joke')`;

    await as('authenticated',A);
    assert.equal(await scalar(legacy,[S1]),'durability_confirmation_required');
    assert.equal(await scalar(auto,[S1]),'durability_confirmation_required');
    assert.equal(await scalar(confirmed,[S1,false]),'durability_confirmation_required');
    assert.equal(await scalar('SELECT status FROM public.memory_suggestions WHERE id=$1',[S1]),'pending');
    assert.equal(await scalar('SELECT count(*)::int FROM public.memories'),0);
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),0);
    assert.equal(await scalar(confirmed,[S1,true]),'approved');
    assert.equal(await scalar(confirmed,[S1,true]),'approved');
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),1);
    assert.equal(await scalar('SELECT reason_code FROM public.memory_durability_overrides WHERE suggestion_id=$1',[S1]),'one_time_request');
    assert.equal(await scalar('SELECT actor_user_id::text FROM public.memory_durability_overrides WHERE suggestion_id=$1',[S1]),A);
    const receipt = (await db.query('SELECT content_digest, approved_subject FROM public.memory_durability_overrides WHERE suggestion_id=$1',[S1])).rows[0];
    assert.match(receipt.content_digest,/^[0-9a-f]{64}$/);
    assert.equal(receipt.approved_subject,'user');
    assert.equal(await scalar(legacy,[S2]),'approved');
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),1);
    assert.equal(await scalar(legacy,[S4]),'durability_confirmation_required');
    assert.equal(await scalar(auto,[S4]),'durability_confirmation_required');
    assert.equal(await scalar(confirmed,[S4,true]),'approved');
    assert.equal(await scalar('SELECT reason_code FROM public.memory_durability_overrides WHERE suggestion_id=$1',[S4]),'question');
    assert.equal(await scalar(legacy,[S5]),'durability_confirmation_required');
    assert.equal(await scalar(confirmed,[S5,true]),'approved');
    assert.equal(await scalar('SELECT reason_code FROM public.memory_durability_overrides WHERE suggestion_id=$1',[S5]),'form_of_address');
    assert.equal(await scalar(legacy,[S8]),'approved');

    // Ownership contradiction cannot be overridden.
    await assert.rejects(() => scalar(confirmed,[S7,true]),/Memory wording and subject disagree/);
    assert.equal(await scalar('SELECT status FROM public.memory_suggestions WHERE id=$1',[S7]),'pending');

    // A forged suggestion's evidence is not authoritative even with override.
    await assert.rejects(() => scalar(confirmed,[S9,true]),/Source evidence unavailable/);
    assert.equal(await scalar('SELECT status FROM public.memory_suggestions WHERE id=$1',[S9]),'pending');

    // Sibling companion is a different memory world but same authorized owner.
    assert.equal(await scalar(legacy,[S6]),'approved');
    assert.equal(await scalar('SELECT count(*)::int FROM public.memories WHERE companion_id=$1',[C3]),1);
    assert.equal(await scalar('SELECT count(*)::int FROM public.memories WHERE companion_id=$1',[C2]),0);

    // Foreign-owner approval must fail and audit rows must remain invisible.
    await assert.rejects(() => scalar(legacy,[S3]),/Suggestion not available/);
    await assert.rejects(() => scalar(confirmed,[S3,true]),/Suggestion not available/);
    await assert.rejects(() => db.query('INSERT INTO public.memory_durability_overrides(id) VALUES (gen_random_uuid())'),/permission denied/);

    await as('authenticated',B);
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),0);
    await assert.rejects(() => scalar(confirmed,[S1,true]),/Suggestion not available/);
    assert.equal(await scalar(legacy,[S3]),'approved');
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),0);

    await as('anon');
    await assert.rejects(() => scalar(legacy,[S1]),/permission denied/);
    await assert.rejects(() => scalar(confirmed,[S1,true]),/permission denied/);
    await assert.rejects(() => scalar('SELECT count(*) FROM public.memory_durability_overrides'),/permission denied/);

    await as('service_role');
    await assert.rejects(() => scalar(legacy,[S1]),/permission denied/);
    await assert.rejects(() => scalar(confirmed,[S1,true]),/permission denied/);

    await admin();
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_durability_overrides'),3);
    assert.equal(await scalar('SELECT count(*)::int FROM public.memory_suggestions WHERE status=$1',['pending']),2);
    console.log('Phase 1b SQL contract passed: legacy/auto guard, deliberate override audit, owner/sibling isolation, RLS, denial, evidence integrity.');
  } finally {
    await db.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode=1;
});
