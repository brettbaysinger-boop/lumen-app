// Isolated in-memory PostgreSQL; never connects to the application database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      INSERT INTO auth.users VALUES ('${owner}'), ('${other}');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261010170000_private_document_styles.sql'), 'utf8'));
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${owner}', false);`);
    await db.query('INSERT INTO document_styles(owner_user_id,settings) VALUES ($1,$2)', [owner, {company_name: 'Owner A'}]);
    await assert.rejects(db.query('INSERT INTO document_styles(owner_user_id,settings) VALUES ($1,$2)', [other, {}]));
    await assert.rejects(db.query('UPDATE document_styles SET owner_user_id=$1 WHERE owner_user_id=$2', [other, owner]));
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${other}', false);`);
    assert.equal((await db.query('SELECT * FROM document_styles')).rows.length, 0);
    await db.exec(`UPDATE document_styles SET settings='{}'; DELETE FROM document_styles;`);
    await db.query('INSERT INTO document_styles(owner_user_id,settings) VALUES ($1,$2)', [other, {company_name: 'Owner B'}]);
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${owner}', false);`);
    const rows = (await db.query('SELECT * FROM document_styles')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].settings.company_name, 'Owner A');
    await assert.rejects(db.query('UPDATE document_styles SET settings=$1', [{logo_png: 'x'.repeat(710001)}]));
    await db.exec('DELETE FROM document_styles;');
    assert.equal((await db.query('SELECT * FROM document_styles')).rows.length, 0);
    await db.exec(`RESET ROLE; SET ROLE anon;`);
    await assert.rejects(db.query('SELECT * FROM document_styles'));
    await assert.rejects(db.query('INSERT INTO document_styles(owner_user_id) VALUES ($1)', [owner]));
    console.log('PASS: owner CRUD, cross-owner isolation, ownership transfer denial, size limit and anonymous denial.');
  } finally {await db.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
