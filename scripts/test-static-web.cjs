const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createWebServer} = require('./serve-web.cjs');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'lumen-static-'));
  fs.writeFileSync(path.join(root,'index.html'),'<html>Lumen</html>');
  fs.writeFileSync(path.join(root,'entry.js'),'console.log("Lumen")');
  fs.writeFileSync(path.join(root,'.env'),'private');
  fs.symlinkSync('/etc/passwd',path.join(root,'outside.txt'));
  const server = createWebServer(root);
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/', '/login', '/recover', '/support', '/my-day']) {
      const response = await fetch(base+route,{headers:{Accept:'text/html'}});
      assert.equal(response.status,200);assert.match(await response.text(),/Lumen/);
      assert.equal(response.headers.get('cache-control'),'no-cache');
    }
    const asset=await fetch(base+'/entry.js');assert.equal(asset.status,200);
    assert.match(asset.headers.get('content-type'),/javascript/);
    const head=await fetch(base+'/entry.js',{method:'HEAD'});assert.equal(await head.text(),'');
    assert.equal(Number(head.headers.get('content-length')),fs.statSync(path.join(root,'entry.js')).size);
    for (const route of ['/missing.js','/.env','/%2eenv','/outside.txt','/%2e%2e%2fsecret','/bad%ZZ']) {
      const response = await fetch(base+route,{headers:{Accept:'text/html'}});
      assert.ok([400,404].includes(response.status),route);
    }
    assert.equal((await fetch(base+'/missing-api',{headers:{Accept:'application/json'}})).status,404);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
    console.log('Static web routes, assets, HEAD, cache policy, private files, traversal and symlink checks passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exit(1);});
