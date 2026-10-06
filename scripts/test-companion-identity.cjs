const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 try {
  await db.exec("CREATE TABLE companions(id text PRIMARY KEY, portrait_url text NOT NULL DEFAULT '/lumen-portrait.webp'); INSERT INTO companions VALUES('legacy','/lumen-portrait.webp'),('upload','owner/custom.png'),('alternative','/lumen-portrait-tide.webp');");
  const migration = fs.readFileSync('supabase/migrations/20261006210000_companion_identity_voice.sql','utf8');
  await db.exec(migration);
  const rows = (await db.query('SELECT * FROM companions ORDER BY id')).rows;
  assert.equal(rows.find(r=>r.id==='legacy').portrait_url,'/lumen-original.jpg');
  assert.equal(rows.find(r=>r.id==='upload').portrait_url,'owner/custom.png');
  assert.equal(rows.find(r=>r.id==='alternative').portrait_url,'/lumen-portrait-tide.webp');
  assert.ok(rows.every(r=>r.gender==='unspecified' && r.speech_voice===null));
  await db.exec("INSERT INTO companions(id) VALUES('new'); UPDATE companions SET gender='male',speech_voice='am_adam' WHERE id='new';");
  assert.equal((await db.query("SELECT portrait_url FROM companions WHERE id='new'")).rows[0].portrait_url,'/lumen-original.jpg');
  await assert.rejects(db.exec("UPDATE companions SET gender='invalid' WHERE id='new'"),/check constraint/);
  await db.exec(migration);
  assert.equal((await db.query("SELECT speech_voice FROM companions WHERE id='new'")).rows[0].speech_voice,'am_adam');
  console.log('Identity migration passed: old default replaced, uploaded portraits preserved, defaults and constraints valid, replay safe.');
 } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
