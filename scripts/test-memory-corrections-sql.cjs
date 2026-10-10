// Isolated PostgreSQL engine. Never connects to the application database.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333',D='44444444-4444-4444-8444-444444444444';
const CHAT='55555555-5555-4555-8555-555555555555',OTHERCHAT='66666666-6666-4666-8666-666666666666';
const M='77777777-7777-4777-8777-777777777777',N='88888888-8888-4888-8888-888888888888';
let seq=0;const key=()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++seq).padStart(12,'0')}`;
(async()=>{const db=new PGlite();let checks=0;try{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE companions(id uuid PRIMARY KEY,owner_user_id uuid);
 CREATE TABLE conversations(id uuid PRIMARY KEY,companion_id uuid REFERENCES companions(id));
 CREATE TABLE memories(id uuid PRIMARY KEY,companion_id uuid REFERENCES companions(id),content text,subject text,
 is_active boolean DEFAULT true,source text,tags text[] DEFAULT '{}',updated_at timestamptz DEFAULT now());
 INSERT INTO companions VALUES('${C}','${A}'),('${D}','${B}');
 INSERT INTO conversations VALUES('${CHAT}','${C}'),('${OTHERCHAT}','${D}');
 INSERT INTO memories(id,companion_id,content,subject,source,tags) VALUES
 ('${M}','${C}','My favorite color is red','user','manual',ARRAY['topic:favorite_color']),
 ('${N}','${D}','My favorite color is green','user','manual',ARRAY['topic:favorite_color']);
 ALTER TABLE companions ENABLE ROW LEVEL SECURITY;CREATE POLICY owner ON companions TO authenticated USING(owner_user_id=auth.uid());
 ALTER TABLE memories ENABLE ROW LEVEL SECURITY;CREATE POLICY owner ON memories TO authenticated USING(EXISTS(SELECT 1 FROM companions c WHERE c.id=companion_id AND c.owner_user_id=auth.uid()));
 GRANT SELECT ON companions,conversations TO authenticated;GRANT SELECT,UPDATE,INSERT,DELETE ON memories TO authenticated;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261010190000_memory_corrections.sql','utf8'));
 const identity=async user=>{await db.exec('RESET ROLE;SET ROLE authenticated;');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);};
 const read=async()=> (await db.query('SELECT * FROM memories WHERE id=$1',[M])).rows[0];
 const correct=async(opts={})=>{
  const {cid=C,chat=CHAT,request=key(),memory=M,version=0,before='My favorite color is red',after='My favorite color is blue',kind='correction',source='Actually my favorite color is blue'}=opts;
  return (await db.query('SELECT correct_user_memory($1,$2,$3,$4,$5,$6,$7,$8,$9) AS receipt',
   [cid,chat,request,memory,version,before,after,kind,source])).rows[0].receipt;
 };
 const undo=async id=>(await db.query('SELECT undo_memory_correction($1) AS receipt',[id])).rows[0].receipt;
 const rejects=async(p,regex)=>{await assert.rejects(p,regex);checks++;};
 await identity(A);
 const request=key(),r=await correct({request});
 assert.equal((await read()).content,r.after_content);assert.equal((await read()).revision_version,1);checks++;
 assert.equal(r.before_content,'My favorite color is red');assert.equal(r.before_source,'manual');assert.equal(r.kind,'correction');checks++;
 assert.equal((await correct({request})).id,r.id);assert.equal((await read()).revision_version,1);checks++;
 await rejects(correct({request,after:'different'}),/Request conflict/);
 await rejects(correct(),/Memory changed/);
 await rejects(correct({chat:OTHERCHAT,version:1}),/Conversation unavailable/);
 await rejects(correct({memory:N,version:1}),/Memory unavailable/);
 await rejects(correct({cid:D,chat:OTHERCHAT,memory:N}),/Companion unavailable/);
 await rejects(db.query('UPDATE memory_revisions SET after_content=$1 WHERE id=$2',['forged',r.id]),/permission denied/);
 await rejects(db.query('DELETE FROM memory_revisions WHERE id=$1',[r.id]),/permission denied/);
 await rejects(db.query('INSERT INTO memory_revisions DEFAULT VALUES'),/permission denied/);
 const u=await undo(r.id);assert.ok(u.undone_at);assert.equal((await read()).content,'My favorite color is red');assert.equal((await read()).source,'manual');checks++;
 assert.equal((await undo(r.id)).undone_at,u.undone_at);assert.equal((await read()).revision_version,2);checks++;
 assert.ok((await correct({request})).undone_at);assert.equal((await read()).content,'My favorite color is red');checks++;
 const changed=await correct({version:2,kind:'change',source:'It used to be red; now it is blue'});
 assert.equal(changed.kind,'change');assert.equal((await read()).source,'user_changed');checks++;
 // Any subsequent edit, even an ABA change back to the same content, invalidates Undo.
 await db.query('UPDATE memories SET content=$1 WHERE id=$2',['My favorite color is green',M]);
 await db.query('UPDATE memories SET content=$1 WHERE id=$2',['My favorite color is blue',M]);
 await rejects(undo(changed.id),/Memory changed since/);
 let current=await read();
 const newer=await correct({version:current.revision_version,before:current.content,after:'My favorite color is gold'});
 await db.query('UPDATE memories SET is_active=false WHERE id=$1',[M]);
 await rejects(undo(newer.id),/Memory changed since/);
 await rejects(correct({version:(await read()).revision_version,before:'My favorite color is gold'}),/Memory unavailable/);
 await db.query('UPDATE memories SET is_active=true,subject=$1 WHERE id=$2',['companion',M]);
 await rejects(correct({version:(await read()).revision_version,before:'My favorite color is gold'}),/Memory unavailable/);
 await db.query('UPDATE memories SET subject=$1 WHERE id=$2',['user',M]);
 current=await read();
 await rejects(correct({version:current.revision_version,before:current.content,after:''}),/Invalid correction/);
 await rejects(correct({version:current.revision_version,before:current.content,after:'x'.repeat(501)}),/Invalid correction/);
 await rejects(correct({version:current.revision_version,before:current.content,kind:'invented'}),/Invalid correction/);
 await db.query('INSERT INTO memories(id,companion_id,content,subject,tags) VALUES($1,$2,$3,$4,$5)',[key(),C,'My favorite color is purple','user',['topic:favorite_color']]);
 await rejects(correct({version:current.revision_version,before:current.content}),/Conflicting saved memories/);
 assert.equal((await read()).content,current.content);checks++;
 await identity(B);
 assert.equal((await db.query('SELECT * FROM memory_revisions')).rows.length,0);checks++;
 await rejects(undo(r.id),/Correction unavailable/);
 await rejects(correct(),/Companion unavailable/);
 await db.exec('RESET ROLE;SET ROLE anon;');
 await rejects(db.query('SELECT * FROM memory_revisions'),/permission denied/);
 await rejects(undo(r.id),/permission denied/);
 await rejects(correct(),/permission denied/);
 console.log(`PASS: ${checks} memory correction SQL checks: owner isolation, revisions, replay, stale writes, Undo, ABA protection, deletion, duplicate topics and anonymous denial.`);
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
