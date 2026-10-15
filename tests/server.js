// 测试用服务：静态文件 + 真的 api/sync.js + 内存版 Upstash（GET / SET / EVAL 那段「版本对得上才写」）
// 用法：node server.js <站点目录> <端口> <sync.js 路径>
//   /            → 站点目录的 index.html（被测的新版）
//   /old/        → 本目录 old/index.html（改动前的版本，新旧对照用）
//   /__store     → 假 Redis 里现在存着什么
//   /__delay?ms= → 让 /api/sync 的每个响应晚这么久再回（模拟慢网）
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], PORT = +process.argv[3], SYNC = process.argv[4];
const store = new Map();
let delay = 0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((q, s) => {
  let b = ''; q.on('data', d => b += d); q.on('end', () => {
    const cmd = JSON.parse(b || '[]'); let result = null;
    if (cmd[0] === 'GET') result = store.has(cmd[1]) ? store.get(cmd[1]) : null;
    else if (cmd[0] === 'SET') { store.set(cmd[1], cmd[2]); result = 'OK'; }
    else if (cmd[0] === 'EVAL') {
      const key = cmd[3], base = Number(cmd[4]), next = cmd[5];
      const cur = store.has(key) ? store.get(key) : null;
      let v = 0;
      if (cur) { const m = /^\{"version":(\d+)/.exec(cur); v = m ? Number(m[1]) : 0; }
      if (v !== base) result = [0, v, cur || ''];
      else { store.set(key, next); result = [1, v + 1]; }
    }
    s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ result }));
  });
}).listen(PORT + 1, () => {
  process.env.KV_REST_API_URL = 'http://127.0.0.1:' + (PORT + 1);
  process.env.KV_REST_API_TOKEN = 'test';
  const handler = require(path.resolve(SYNC));
  http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/__store') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify([...store])); }
    if (u.pathname === '/__delay') { delay = +u.searchParams.get('ms') || 0; s.writeHead(200); return s.end('ok'); }
    if (u.pathname.startsWith('/api/sync')) {
      let b = ''; q.on('data', d => b += d); q.on('end', () => {
        const req = { method: q.method, query: Object.fromEntries(u.searchParams), body: b ? JSON.parse(b) : undefined };
        const res = { status(c) { s.statusCode = c; return res; }, setHeader(k, v) { s.setHeader(k, v); }, end(x) { setTimeout(() => s.end(x), delay); } };
        handler(req, res);
      });
      return;
    }
    let f;
    if (u.pathname === '/') f = path.join(ROOT, 'index.html');
    else if (u.pathname === '/old/') f = path.join(__dirname, 'old', 'index.html');
    else f = path.join(ROOT, decodeURIComponent(u.pathname));
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end('404'); } s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); s.end(d); });
  }).listen(PORT, () => console.log('test server on ' + PORT + ' root=' + ROOT + ' sync=' + SYNC));
});
