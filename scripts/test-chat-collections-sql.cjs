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
      GRANT SELECT, UPDATE ON conversations TO authenticated;
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

    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM chat_collections'), /permission denied/i);
    console.log('PASS: collection ownership, companion scope, name validation, rename, deletion preserving chats, and anonymous denial.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
