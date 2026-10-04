// Runs the real migrations and RLS policies in an isolated PostgreSQL WASM engine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { pgDump } = require('@electric-sql/pglite-tools/pg_dump');
const { vector } = require('@electric-sql/pglite-pgvector');
const db = new PGlite({ extensions: { vector } });
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
async function as(role, user = '') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`SET ROLE ${role}`);
}
async function scalar(sql, args = []) { return Object.values((await db.query(sql, args)).rows[0])[0]; }
(async () => {
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
    const migrations = fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations.slice(0, -1)) await db.exec(fs.readFileSync(`supabase/migrations/${name}`, 'utf8'));
    const legacy = await scalar('SELECT id FROM companions LIMIT 1');
    await db.query("INSERT INTO conversations(companion_id,title) VALUES($1,'Legacy chat')", [legacy]);
    await db.query("INSERT INTO memories(companion_id,type,content) VALUES($1,'semantic','My favorite color is turquoise')", [legacy]);
    await db.query("INSERT INTO memories(companion_id,type,content) VALUES($1,'semantic', $$Lumen's birthday is October 3, 2026$$)", [legacy]);
    await db.exec(fs.readFileSync(`supabase/migrations/${migrations.at(-1)}`, 'utf8'));
    assert.equal(await scalar("SELECT subject FROM memories WHERE content LIKE 'My%'"), 'user');
    assert.equal(await scalar("SELECT subject FROM memories WHERE content LIKE 'Lumen%'"), 'companion');
    for (const table of ['profiles','companions','conversations','messages','memories','companion_state','self_model','reflections','model_runs']) {
      await as('anon');
      assert.equal(await scalar(`SELECT count(*) FROM ${table}`), 0, `anon ${table}`);
    }
    await assert.rejects(db.query("SELECT ensure_my_companion('Intruder')"), /permission denied/);
    await as('authenticated', A);
    const companionA = await scalar("SELECT ensure_my_companion('Alice')");
    assert.equal(await scalar("SELECT ensure_my_companion('Alice')"), companionA, 'idempotent provision');
    assert.equal(await scalar('SELECT count(*) FROM companions'), 1, 'unowned legacy hidden');
    const conversationA = await scalar('INSERT INTO conversations(companion_id) VALUES($1) RETURNING id', [companionA]);
    await db.query("INSERT INTO memories(companion_id,conversation_id,type,content,subject,subject_user_id,reported_by_user_id) VALUES($1,$2,'preference','my favorite color is turquoise','user',$3,$3)", [companionA,conversationA,B]);
    assert.equal(await scalar('SELECT subject_user_id FROM memories'), A, 'subject identity enforced');
    assert.equal(await scalar('SELECT reported_by_user_id FROM memories'), A, 'speaker comes from JWT');
    await db.query("INSERT INTO messages(companion_id,conversation_id,role,content) VALUES($1,$2,'user','private')", [companionA,conversationA]);
    await db.query("INSERT INTO reflections(companion_id,conversation_id,summary) VALUES($1,$2,'private')", [companionA,conversationA]);
    await db.query("INSERT INTO model_runs(companion_id,conversation_id,task,selected_model,provider) VALUES($1,$2,'chat','local','ollama')", [companionA,conversationA]);
    await as('authenticated', B);
    const companionB = await scalar("SELECT ensure_my_companion('Bob')");
    const conversationB = await scalar('INSERT INTO conversations(companion_id) VALUES($1) RETURNING id', [companionB]);
    for (const table of ['memories','messages','reflections','model_runs']) assert.equal(await scalar(`SELECT count(*) FROM ${table}`), 0, `B cannot read A ${table}`);
    assert.equal(await scalar('SELECT count(*) FROM companions WHERE id=$1', [companionA]), 0);
    assert.equal(await scalar('SELECT count(*) FROM profiles'), 1);
    await assert.rejects(db.query('UPDATE companions SET owner_user_id=$1 WHERE id=$2', [A,companionB]), /row-level security/);
    await assert.rejects(db.query("INSERT INTO memories(companion_id,type,content) VALUES($1,'semantic','attack')", [companionA]), /row-level security/);
    await assert.rejects(db.query("INSERT INTO messages(companion_id,conversation_id,role,content) VALUES($1,$2,'user','attack')", [companionB,conversationA]), /Conversation does not belong/);
    await assert.rejects(db.query("INSERT INTO memories(companion_id,conversation_id,type,content) VALUES($1,$2,'semantic','attack')", [companionB,conversationA]), /Conversation does not belong/);
    const update = await db.query("UPDATE memories SET content='stolen' WHERE companion_id=$1 RETURNING id", [companionA]);
    assert.equal(update.rows.length, 0);
    const deletion = await db.query('DELETE FROM conversations WHERE id=$1 RETURNING id', [conversationA]);
    assert.equal(deletion.rows.length, 0);
    await as('postgres');
    await db.query('UPDATE companions SET owner_user_id=$1 WHERE id=$2', [A,legacy]);
    await db.query('UPDATE memories SET reported_by_user_id=$1 WHERE companion_id=$2', [A,legacy]);
    await as('authenticated', A);
    assert.equal(await scalar('SELECT count(*) FROM conversations'), 2, 'legacy chat preserved');
    assert.equal(await scalar('SELECT count(*) FROM memories'), 3, 'legacy memories preserved');
    assert.equal(await scalar("SELECT subject_user_id FROM memories WHERE content LIKE 'My%'"), A);
    assert.equal(await scalar("SELECT subject_user_id FROM memories WHERE subject='companion'"), null);
    assert.equal(await scalar("SELECT ensure_my_companion('Alice')"), legacy, 'oldest companion selected after claim');
    await as('authenticated', B);
    assert.equal(await scalar('SELECT count(*) FROM conversations'), 1);
    assert.equal(await scalar('SELECT count(*) FROM memories'), 0);
    await as('postgres');
    await db.exec('CREATE SCHEMA extensions; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, encrypted_password text);');
    await db.query("INSERT INTO auth.users VALUES($1,'alice@example.test','test-password-hash')", [A]);
    const dump = await pgDump({ pg: db, args: ['--no-owner',
      '--schema=public','--schema=auth','--schema=extensions',
      '--extension=vector','--extension=pgcrypto','--extension=uuid-ossp'] });
    const restored = new PGlite({ extensions: { vector } });
    try {
      await restored.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; DROP SCHEMA public CASCADE;');
      const sql = (await dump.text()).replace(/^\\(?:un)?restrict.*$/gm, '');
      await restored.exec(sql);
      assert.equal((await restored.query('SELECT count(*) AS n FROM public.memories')).rows[0].n, 3);
      assert.equal((await restored.query('SELECT id FROM auth.users')).rows[0].id, A);
      assert.equal((await restored.query('SELECT encrypted_password FROM auth.users')).rows[0].encrypted_password, 'test-password-hash');
      await restored.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [B]);
      await restored.exec('SET row_security=on; SET ROLE authenticated');
      assert.equal((await restored.query('SELECT count(*) AS n FROM public.memories')).rows[0].n, 0, 'isolation survives restore');
      assert.equal((await restored.query('SELECT count(*) AS n FROM public.companions')).rows[0].n, 1, 'own companion accessible after restore');
      console.log('Full schema/data dump round trip preserved account IDs, password hashes, memories, and isolation.');
    } finally { await restored.close(); }
    console.log('Account isolation, anonymous denial, cross-companion rejection, attribution, and legacy preservation passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
