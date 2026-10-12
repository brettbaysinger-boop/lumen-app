const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
const F = '66666666-6666-4666-8666-666666666666';
const G = '77777777-7777-4777-8777-777777777777';

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE companions(id uuid PRIMARY KEY, owner_user_id uuid);
      INSERT INTO companions VALUES
        ('${C}','${A}'), ('${D}','${B}'), ('${E}','${A}');
      ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON companions TO authenticated;
      CREATE POLICY owner ON companions TO authenticated
        USING (owner_user_id = auth.uid());
      CREATE TABLE conversations (
        id uuid PRIMARY KEY,
        companion_id uuid NOT NULL REFERENCES companions(id),
        title text NOT NULL
      );
      INSERT INTO conversations VALUES ('${F}','${C}','Keep this transcript');
      ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;
      CREATE POLICY owner ON conversations TO authenticated
        USING (EXISTS (
          SELECT 1 FROM companions c
          WHERE c.id = companion_id AND c.owner_user_id = auth.uid()
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM companions c
          WHERE c.id = companion_id AND c.owner_user_id = auth.uid()
        ));
    `);
    await db.exec(fs.readFileSync(
      'supabase/migrations/20261011230500_chat_collections.sql', 'utf8'
    ));

    await db.exec('ALTER TABLE conversations ADD COLUMN is_active boolean DEFAULT true');
    await db.exec(fs.readFileSync(
      'supabase/migrations/20261011234500_reviewed_chat_handoffs.sql', 'utf8'
    ));
    const identity = async user => {
      await db.exec('RESET ROLE; SET ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    };

    await identity(A);
    await db.query(
      'INSERT INTO chat_collections(id,companion_id,name) VALUES($1,$2,$3)',
      [G, C, 'Projects']
    );
    await db.query('UPDATE conversations SET collection_id=$1 WHERE id=$2', [G, F]);
    assert.equal((await db.query(
      'SELECT collection_id FROM conversations WHERE id=$1', [F]
    )).rows[0].collection_id, G);

    await assert.rejects(db.query(
      'INSERT INTO chat_collections(companion_id,name) VALUES($1,$2)',
      [C, 'projects']
    ), /unique|duplicate/i);
    for (const name of ['', ' Leading', 'Trailing ', 'x'.repeat(101)]) {
      await assert.rejects(db.query(
        'INSERT INTO chat_collections(companion_id,name) VALUES($1,$2)',
        [C, name]
      ), /check constraint/i);
    }
    await assert.rejects(db.query(
      'INSERT INTO chat_collections(companion_id,name) VALUES($1,$2)',
      [D, 'Not mine']
    ), /row-level security/i);

    const other = (await db.query(
      "INSERT INTO chat_collections(companion_id,name) VALUES($1,'Other companion') RETURNING id",
      [E]
    )).rows[0].id;
    await assert.rejects(db.query(
      'UPDATE conversations SET collection_id=$1 WHERE id=$2', [other, F]
    ), /foreign key/i);

    await identity(B);
    assert.equal((await db.query('SELECT * FROM chat_collections')).rows.length, 0);
    assert.equal((await db.query(
      "UPDATE chat_collections SET name='Hijacked' WHERE id=$1 RETURNING id", [G]
    )).rows.length, 0);
    assert.equal((await db.query(
      'DELETE FROM chat_collections WHERE id=$1 RETURNING id', [G]
    )).rows.length, 0);

    await identity(A);
    await db.query('UPDATE chat_collections SET name=$1 WHERE id=$2', ['Work', G]);
    await db.query('DELETE FROM chat_collections WHERE id=$1', [G]);
    const chat = (await db.query(
      'SELECT * FROM conversations WHERE id=$1', [F]
    )).rows[0];
    assert.equal(chat.collection_id, null);
    assert.equal(chat.companion_id, C);
    assert.equal(chat.title, 'Keep this transcript');


    const H = '88888888-8888-4888-8888-888888888888';
    const J = '99999999-9999-4999-8999-999999999999';
    const start = async (id, companion, summary, sources, collection = null) =>
      (await db.query(
        'SELECT (start_handoff_chat($1,$2,$3,$4,$5::uuid[],$6)).*',
        [id, companion, 'Fresh project chat', summary, sources, collection]
      )).rows[0];

    await identity(A);
    const fresh = await start(H, C, 'Reviewed next step: test the draft.', [F]);
    assert.equal(fresh.id, H);
    assert.equal(fresh.handoff.summary, 'Reviewed next step: test the draft.');
    assert.deepEqual(fresh.handoff.source_ids, [F]);
    assert.equal(fresh.handoff.sources[0].title, 'Keep this transcript');
    assert.ok(fresh.handoff.reviewed_at);
    assert.equal(fresh.is_active, true);

    const retry = await start(H, C, 'Reviewed next step: test the draft.', [F]);
    assert.equal(retry.id, H);
    assert.equal((await db.query(
      'SELECT count(*)::int AS n FROM conversations WHERE id=$1', [H]
    )).rows[0].n, 1, 'retry creates no duplicate');

    await assert.rejects(
      start(H, C, 'Different reviewed summary', [F]),
      /already used/i
    );
    for (const ids of [[], [F, F], [null], [F,F,F,F,F,F]]) {
      await assert.rejects(start(J, C, 'Test', ids), /Invalid handoff/i);
    }
    await assert.rejects(start(J, C, '', [F]), /Invalid handoff/i);
    await assert.rejects(start(J, C, 'x'.repeat(6001), [F]), /Invalid handoff/i);
    await assert.rejects(start(J, E, 'Test', [F]), /Source chat unavailable/i);
    await assert.rejects(start(J, C, 'Test', [J]), /Source chat unavailable/i);
    await assert.rejects(start(J, C, 'Test', [F], other), /foreign key/i);
    assert.equal((await db.query(
      'SELECT count(*)::int AS n FROM conversations WHERE id=$1', [J]
    )).rows[0].n, 0, 'failed creation leaves no partial chat');

    await identity(B);
    assert.equal((await db.query(
      'SELECT * FROM conversations WHERE id=$1', [H]
    )).rows.length, 0, 'other account cannot read handoff');
    await assert.rejects(start(J, C, 'Test', [F]), /Companion unavailable/i);
    await assert.rejects(start(J, D, 'Test', [F]), /Source chat unavailable/i);

    await identity(A);
    const original = (await db.query(
      'SELECT * FROM conversations WHERE id=$1', [F]
    )).rows[0];
    assert.equal(original.title, 'Keep this transcript');
    assert.equal(original.handoff, null, 'source chat unchanged');

    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM chat_collections'), /permission denied/i);
    await assert.rejects(start(J, C, 'Test', [F]), /permission denied/i);
    console.log('PASS: collections plus reviewed handoff ownership, source scope, validation, idempotent retry, atomic failure, source preservation, and anonymous denial.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
