// Serve the exported SPA without Expo's development server or extra packages.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.woff':'font/woff',
  '.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4'};

function createWebServer(directory) {
  const root = fs.realpathSync(directory);
  const index = fs.realpathSync(path.join(root, 'index.html'));
  if (!index.startsWith(root + path.sep) || !fs.statSync(index).isFile()) throw new Error('Build the web app first.');
  return http.createServer((req, res) => {
    const fail = (status, message) => { res.writeHead(status, {'Content-Type':'text/plain','Cache-Control':'no-store'}); res.end(message); };
    if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); fail(405,'Method not allowed'); return; }
    let name;
    try { name = decodeURIComponent(req.url.split('?')[0]); }
    catch { fail(400,'Invalid path'); return; }
    if (name.includes('\\') || name.includes('\0') || name.split('/').some(part => part.startsWith('.'))) {
      fail(404,'Not found'); return;
    }
    let file = path.resolve(root, '.' + name);
    if (file !== root && !file.startsWith(root + path.sep)) { fail(404,'Not found'); return; }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
      file = fs.realpathSync(file);
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { fail(404,'Not found'); return; }
    } catch {
      // Only browser document navigation gets SPA fallback. Missing assets stay 404.
      if (!(req.headers.accept || '').includes('text/html') || path.extname(name)) { fail(404,'Not found'); return; }
      file = index;
    }
    const stat = fs.statSync(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin'});
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const directory = path.resolve(__dirname,'../dist');
  createWebServer(directory).listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Lumen exported web app listening on port ${port}`);
  });
}
module.exports = {createWebServer};
