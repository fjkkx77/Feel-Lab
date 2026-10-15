/**
 * 手感实验室（Feel-Lab）· 跨设备同步接口 —— 同步「我的手感库」
 * 改编自日程卡片（Schedule-Cards）的 api/sync.js（2026-10-08 起「核对版本 + 写入」用 Upstash EVAL 一步完成），协议相同：
 *   GET  /api/sync?code=xxxx       → {ok, version, doc:{items}}
 *   POST /api/sync  {code, baseVersion, doc:{items}} → 200 {ok, version} / 409 {conflict, version, doc}
 * 和日程卡片、接着来共用同一个 Upstash（环境变量 KV_REST_API_URL / KV_REST_API_TOKEN 手动加在 Vercel 项目上），
 * 靠**键前缀 feel: + 盐 flv1|** 隔开——同一个同步码在三个站里是三份互不相干的数据。
 * 只有默认分区（space 只认空串），响应里照样回传 space，客户端据此确认服务端认得这个参数。
 */

const crypto = require("crypto");

const MAX_BODY_BYTES = 1024 * 1024;  /* 手感库一条几百字节，1MB 够存几千条；Vercel 函数请求体上限 4.5MB */
const MAX_ITEMS = 3000;
const TTL_SECONDS = 400 * 24 * 3600; /* 每次写入续期，长期不用才自动过期 */

function creds(){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return (url && token) ? { url: url.replace(/\/+$/, ""), token } : null;
}

async function redis(command){
  const c = creds();
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  if(!r.ok){
    const t = await r.text().catch(() => "");
    throw new Error("存储服务返回 " + r.status + " " + t.slice(0, 200));
  }
  const j = await r.json();
  return j.result;
}

/* 同步码本身不落库，只存它的哈希，拿到数据库也反推不出同步码 */
function keyOf(code){
  return "feel:" + crypto.createHash("sha256").update("flv1|" + code).digest("hex").slice(0, 40);
}

/* 原子的「版本对得上才写」。返回 {1, 新版本} 或 {0, 当前版本, 当前整份数据}。
   数据损坏（取不到版本号）时当作版本 0，和原来"坏数据让这次写入覆盖掉"的行为一致 */
const CAS_SCRIPT = [
  "local cur = redis.call('GET', KEYS[1])",
  "local v = 0",
  "if cur then v = tonumber(string.match(cur, '^{\"version\":(%d+)')) or 0 end",
  "if v ~= tonumber(ARGV[1]) then return {0, v, cur or ''} end",
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])",
  "return {1, v + 1}"
].join("\n");

const SPACES = [""];
function cleanSpace(v){
  const s = String(v == null ? "" : v).trim();
  return SPACES.indexOf(s) > -1 ? s : null;
}

function cleanCode(v){
  const s = String(v == null ? "" : v).trim();
  return /^[A-Za-z0-9\-_]{8,64}$/.test(s) ? s : null;
}

function send(res, status, obj){
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try{
    if(req.method === "OPTIONS"){ res.status(204); res.end(); return; }

    const configured = !!creds();

    if(req.method === "GET"){
      const raw = (req.query && req.query.code) || "";
      if(!raw) return send(res, 200, { ok: true, configured });   /* 探测用 */
      if(!configured) return send(res, 503, { ok: false, error: "服务端还没配置存储（缺少 Upstash 环境变量）" });

      const code = cleanCode(raw);
      if(!code) return send(res, 400, { ok: false, error: "同步码只能是 8~64 位的字母、数字、- 或 _" });
      const space = cleanSpace(req.query && req.query.space);
      if(space === null) return send(res, 400, { ok: false, error: "不认识的 space" });

      const val = await redis(["GET", keyOf(code)]);
      if(!val) return send(res, 200, { ok: true, space, version: 0, doc: { items: [] }, empty: true });

      let parsed;
      try{ parsed = JSON.parse(val); }
      catch(e){ return send(res, 500, { ok: false, error: "服务端数据损坏" }); }
      return send(res, 200, {
        ok: true,
        space,
        version: parsed.version || 0,
        updatedAt: parsed.updatedAt || 0,
        doc: { items: Array.isArray(parsed.items) ? parsed.items : [] }
      });
    }

    if(req.method === "POST"){
      if(!configured) return send(res, 503, { ok: false, error: "服务端还没配置存储（缺少 Upstash 环境变量）" });

      let body = req.body;
      if(typeof body === "string"){
        try{ body = JSON.parse(body); }catch(e){ return send(res, 400, { ok:false, error:"请求体不是合法 JSON" }); }
      }
      if(!body || typeof body !== "object") return send(res, 400, { ok: false, error: "缺少请求体" });

      const code = cleanCode(body.code);
      if(!code) return send(res, 400, { ok: false, error: "同步码只能是 8~64 位的字母、数字、- 或 _" });
      const space = cleanSpace(body.space);
      if(space === null) return send(res, 400, { ok: false, error: "不认识的 space" });

      const items = body.doc && Array.isArray(body.doc.items) ? body.doc.items : null;
      if(!items) return send(res, 400, { ok: false, error: "缺少 doc.items" });
      if(items.length > MAX_ITEMS) return send(res, 413, { ok: false, error: "条目数超过上限 " + MAX_ITEMS });

      const payload = JSON.stringify({ items });
      if(Buffer.byteLength(payload, "utf8") > MAX_BODY_BYTES){
        return send(res, 413, { ok: false, error: "数据超过 1MB 上限" });
      }

      const key = keyOf(code);
      const base = Number(body.baseVersion || 0);
      const next = {
        version: base + 1,
        updatedAt: Date.now(),
        items: items
      };
      /* 「核对版本 + 写入」必须在存储那边一步做完：原先先 GET 再 SET，两台设备同时写时
         两边都读到同一个版本、都写成功，后写的把先写的整份盖掉（2026-10-08 实测 10 次 10 次都中）。
         脚本只用字符串匹配取版本号，不依赖 cjson（Upstash 文档没写脚本里有哪些库）；
         版本号永远是 JSON 的第一个字段，因为 next 对象就是这么写的 */
      const r = await redis(["EVAL", CAS_SCRIPT, "1", key, String(base), JSON.stringify(next), String(TTL_SECONDS)]);
      if(Number(r[0]) !== 1){
        /* 另一台设备抢先写了：把最新版还给客户端，让它重新合并后再来一次 */
        let curDoc = { items: [] };
        try{ const p = JSON.parse(r[2] || "null"); if(p && Array.isArray(p.items)) curDoc = { items: p.items }; }
        catch(e){ /* 坏数据当作空 */ }
        return send(res, 409, { ok: false, conflict: true, space, version: Number(r[1]) || 0, doc: curDoc });
      }
      return send(res, 200, { ok: true, space, version: next.version, updatedAt: next.updatedAt });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "只支持 GET / POST" });
  }catch(err){
    return send(res, 500, { ok: false, error: String(err && err.message || err) });
  }
};
