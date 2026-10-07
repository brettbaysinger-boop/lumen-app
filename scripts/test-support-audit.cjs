const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
(async()=>{try{
 await db.exec('CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO authenticated,anon,service_role;');
 await db.exec(fs.readFileSync('supabase/migrations/20261007001500_support_audit.sql','utf8'));
 await db.exec('SET ROLE service_role');
 await db.exec("INSERT INTO support_audit(id,actor_user_id,target_user_id,action,status) VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','unlock','requested')");
 await db.exec("UPDATE support_audit SET status='accepted',finished_at=now()");
 assert.equal((await db.query('SELECT status FROM support_audit')).rows[0].status,'accepted');
 await assert.rejects(db.exec('DELETE FROM support_audit'),/permission denied/);
 await assert.rejects(db.exec("UPDATE support_audit SET action='recovery'"),/permission denied/);
 for(const role of ['authenticated','anon']){
  await db.exec('RESET ROLE; SET ROLE '+role);
  await assert.rejects(db.exec('SELECT * FROM support_audit'),/permission denied/);
  await assert.rejects(db.exec("INSERT INTO support_audit(id,actor_user_id,target_user_id,action,status) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'unlock','requested')"),/permission denied/);
 }
 console.log('Support audit migration: service-only writes, protected action identity, no client reads/writes/deletes.');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exit(1)});
