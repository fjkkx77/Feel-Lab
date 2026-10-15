/* 手感实验室 · 主程序：手感库（本机 + 同步码同步）、路由（首页 / 模块 / 手感库）、云同步弹窗
   数据：localStorage 'feel-lab-v1' = {items:[...]}，每条
     {id, module, name, values, device, time, final, createdAt, updatedAt, order, deletedAt?}
   同步走存档「组件_多设备同步」（墓碑删除、order、id+updatedAt 逐条合并），服务端 api/sync.js（键前缀 feel:） */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'feel-lab-v1';
  var M = window.FeelModules;

  /* ---------- 存储 ---------- */
  var store = { items: [] };
  try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.items)) store.items = d.items.filter(function (x) { return x && x.id && x.module && x.values; }); } catch (e) { /* 坏数据：从空开始 */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast('本机存不下了（隐私模式？）'); } }
  function live() { return store.items.filter(function (x) { return !x.deletedAt; }); }
  function ofModule(id) { return live().filter(function (x) { return x.module === id; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); }
  function finalOf(id) { return ofModule(id).filter(function (x) { return x.final; })[0] || null; }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function commit() { persist(); if (client) client.schedule(); }

  /* ---------- 轻提示 / 确认框（不用原生 alert / confirm） ---------- */
  var toastTimer = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2200); }
  function ask(title, text, okLabel, onOk, danger) {
    $('askT').textContent = title; $('askP').textContent = text || ''; $('askOk').textContent = okLabel || '确定';
    $('askOk').className = 'btn ' + (danger ? 'danger' : 'pri');
    $('askMask').hidden = false;
    $('askOk').onclick = function () { $('askMask').hidden = true; onOk(); };
    $('askNo').onclick = function () { $('askMask').hidden = true; };
  }
  $('askMask').addEventListener('click', function (e) { if (e.target === $('askMask')) $('askMask').hidden = true; });

  /* ---------- 云同步 ---------- */
  var client = null, panel = null;
  if (window.SyncClient) {
    client = SyncClient.create({
      api: 'api/sync', field: 'items', key: 'feel-lab-sync',
      getLocal: function () { return store.items; },
      setLocal: function (l) { store.items = l; persist(); refreshSoft(); }
    });
    client.onState(function () { SyncPanel.paintLine($('syncLine'), client); });
    client.start();
    $('syncSheet').innerHTML = SyncPanel.markup({ noun: '手感参数' });
    panel = SyncPanel.bind($('syncSheet'), { client: client, toast: toast, confirm: function (t, x, ok, fn) { ask(t, x, ok, fn, true); }, close: closeSync });
  }
  function openSync() { if (panel) panel.fill(); $('syncMask').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSync() { $('syncMask').hidden = true; document.body.style.overflow = ''; }
  $('syncMask').addEventListener('click', function (e) { if (e.target === $('syncMask')) closeSync(); });
  if (window.SheetDismiss) SheetDismiss({
    sheets: function () { return [{ mask: $('syncMask'), sheet: $('syncSheet'), close: closeSync, dirty: function () { return panel ? panel.dirty() : false; } }]; },
    blocked: function () { return !$('askMask').hidden; },
    confirmDiscard: function (S) { ask('放弃这次修改？', '同步码改了还没点「开启并同步」。', '放弃', function () { S.close(); }, true); }
  });

  /* ---------- 路由 ---------- */
  var cleanup = null, curTp = null, curRoute = '';
  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    if (curTp) { curTp.destroy(); curTp = null; }
    var h = location.hash.replace(/^#/, '') || '/';
    curRoute = h;
    var view = $('view'); view.innerHTML = '';
    window.scrollTo(0, 0);
    var m = /^\/m\/([a-z]+)(\?use=(.+))?$/.exec(h);
    if (m && M.byId(m[1]) && !M.byId(m[1]).soon) return pageModule(view, M.byId(m[1]), m[3]);
    if (h === '/lib') return pageLib(view);
    return pageHome(view);
  }
  /* 同步落地时：首页、手感库整页重画；模块页只刷新「已存的」那一块，不打断正在调的面板 */
  function refreshSoft() {
    if (/^\/m\//.test(curRoute)) { var b = $('savedBox'); if (b && b.__paint) b.__paint(); return; }
    route();
  }
  window.addEventListener('hashchange', route);

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(text, cls, fn) { var b = h('button', 'btn lb-press' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* ---------- 首页 ---------- */
  function pageHome(view) {
    var ready = M.list.filter(function (x) { return !x.soon; }), soon = M.list.filter(function (x) { return x.soon; });
    view.appendChild(h('h2', 'sec-title', '可以调了'));
    view.appendChild(grid(ready));
    var t = h('h2', 'sec-title', '即将推出'); t.appendChild(h('small', '', soon.length + ' 个'));
    view.appendChild(t);
    view.appendChild(grid(soon));
  }
  function grid(list) {
    var g = h('div', 'grid');
    list.forEach(function (mod) {
      var c = h(mod.soon ? 'div' : 'button', 'mcard' + (mod.soon ? ' soon' : ' lb-press'));
      if (!mod.soon) { c.type = 'button'; c.addEventListener('click', function () { location.hash = '#/m/' + mod.id; }); }
      var hd = h('div', 'mcard-h');
      hd.appendChild(h('span', 'mcard-ico', mod.ico));
      hd.appendChild(h('span', 'mcard-t', mod.title));
      var n = ofModule(mod.id).length, fin = finalOf(mod.id);
      hd.appendChild(h('span', 'badge' + (fin ? ' ok' : n ? ' mid' : ''), mod.soon ? '即将推出' : fin ? '已定稿' : n ? '存了 ' + n + ' 组' : '未调'));
      c.appendChild(hd);
      c.appendChild(h('p', 'mcard-d', mod.desc));
      g.appendChild(c);
    });
    return g;
  }

  /* ---------- 模块页 ---------- */
  var KIND = { off: ['官方原文', 'k-off'], '3rd': ['第三方', 'k-3rd'], der: ['推导', 'k-der'], me: ['我定的起点', 'k-me'], user: ['你真机调定', 'k-user'] };
  function kindTag(k) { var s = h('span', 'kind ' + KIND[k][1], KIND[k][0]); return s; }
  function pageModule(view, mod, useId) {
    view.appendChild(backBtn());
    view.appendChild(h('h2', 'mtitle', mod.ico + ' ' + mod.title));
    view.appendChild(h('p', 'mdesc', mod.desc));
    /* 示范区 */
    var b1 = h('section', 'block'); b1.appendChild(h('h3', 'block-h', '示范（真能点）'));
    var stage = h('div', 'stage'); b1.appendChild(stage); view.appendChild(b1);
    /* 面板（嵌在页面里） */
    var b2 = h('section', 'block'); b2.appendChild(h('h3', 'block-h', '调手感'));
    var mount = h('div'); b2.appendChild(mount); view.appendChild(b2);
    curTp = TunePanel({ project: 'Feel-Lab', version: mod.id, groups: mod.groups, curves: mod.curves, mount: mount,
                        finalName: mod.id.toUpperCase() + '_DEFAULT', qrSrc: 'assets/qrcode.js', title: mod.title });
    var tp = curTp;
    if (useId) {                                         /* 从手感库点「用这组」进来 */
      var it = live().filter(function (x) { return x.id === decodeURIComponent(useId); })[0];
      if (it) { for (var k in it.values) tp.set(k, it.values[k], true); toast('已换成「' + it.name + '」'); }
      try { history.replaceState(null, '', '#/m/' + mod.id); curRoute = '/m/' + mod.id; } catch (e) { /* 留着也不影响 */ }
    }
    try { cleanup = mod.mount(stage, tp); } catch (e) { console.error(e); stage.textContent = '示范出错了：' + e.message; }
    /* 存进手感库 */
    var b3 = h('section', 'block'); b3.appendChild(h('h3', 'block-h', '存进我的手感库'));
    var row = h('div', 'save-row'), inp = h('input', 'inp'); inp.placeholder = '给这组起个名字（如：Q 一点）'; inp.maxLength = 20;
    row.appendChild(inp);
    row.appendChild(button('存进去', 'pri', function () {
      var ex = tp.export(), n = ofModule(mod.id).length + 1, t = Date.now();
      store.items.push({ id: uid(), module: mod.id, name: inp.value.trim() || ('第 ' + n + ' 组'), values: ex.values, device: ex.device, time: ex.time,
                         final: false, createdAt: t, updatedAt: t, order: t });
      inp.value = ''; commit(); paintSaved(); toast('已存进手感库');
    }));
    b3.appendChild(row);
    b3.appendChild(h('p', 'hint', '存进去的会跟着同步码同步到你的其他设备。满意的那组在手感库里「设为定稿」，我以后做新项目就直接用它。'));
    var saved = h('div'); saved.id = 'savedBox'; b3.appendChild(saved);
    function paintSaved() {
      saved.innerHTML = '';
      var list = ofModule(mod.id);
      if (!list.length) return;
      saved.appendChild(h('p', 'hint', '这个模块已存 ' + list.length + ' 组' + (finalOf(mod.id) ? '，定稿是「' + finalOf(mod.id).name + '」' : '') + '：'));
      list.slice(0, 6).forEach(function (it) {
        var r = h('div', 'save-row'); r.style.marginTop = '6px';
        r.appendChild(h('span', 'entry-n', (it.final ? '★ ' : '') + it.name));
        r.appendChild(button('用这组', '', function () { for (var k in it.values) tp.set(k, it.values[k]); toast('已换成「' + it.name + '」'); }));
        saved.appendChild(r);
      });
    }
    saved.__paint = paintSaved; paintSaved();
    view.appendChild(b3);
    /* 参数从哪来 */
    var b4 = h('section', 'block'); b4.appendChild(h('h3', 'block-h', '每个参数的起点从哪来'));
    var tb = h('table', 'ptable'), fin = finalOf(mod.id);
    mod.groups.forEach(function (g) { g.params.forEach(function (p) {
      var tr = h('tr');
      tr.appendChild(h('td', '', p.label));
      tr.appendChild(h('td', '', (p.type === 'toggle' ? (p.default ? '开' : '关') : String(p.default)) + (p.unit ? ' ' + p.unit : '')));
      var td = h('td'); var k = (fin && fin.values[p.key] !== undefined) ? 'user' : (mod.src[p.key] || 'me');
      td.appendChild(kindTag(mod.src[p.key] || 'me'));
      if (mod.srcNote && mod.srcNote[p.key]) td.appendChild(document.createTextNode(mod.srcNote[p.key]));
      if (k === 'user') { var u = h('div'); u.appendChild(kindTag('user')); u.appendChild(document.createTextNode(String(fin.values[p.key]))); td.appendChild(u); }
      tr.appendChild(td); tb.appendChild(tr);
    }); });
    b4.appendChild(tb); view.appendChild(b4);
    /* 参照 */
    var b5 = h('section', 'block'); b5.appendChild(h('h3', 'block-h', 'Apple 怎么说 / 别人怎么说'));
    var ul = h('ul', 'refs');
    mod.refs.forEach(function (r) {
      var li = h('li'); li.appendChild(kindTag(r.k)); li.appendChild(document.createTextNode(r.t + ' '));
      if (r.url) { var a = h('a', '', '出处'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); }
      ul.appendChild(li);
    });
    b5.appendChild(ul); view.appendChild(b5);
  }
  function backBtn() { var b = h('button', 'back lb-press', '‹ 返回'); b.type = 'button'; b.addEventListener('click', function () { if (history.length > 1 && document.referrer.indexOf(location.host) > -1) history.back(); else location.hash = '#/'; }); return b; }

  /* ---------- 手感库 ---------- */
  function pageLib(view) {
    view.appendChild(backBtn());
    view.appendChild(h('h2', 'mtitle', '我的手感库'));
    view.appendChild(h('p', 'mdesc', '每个模块存过的参数都在这里；★ 是定稿。定稿的那组我以后做新项目第一版就直接用。'));
    var bar = h('div', 'toolbar');
    bar.appendChild(button('复制全部定稿', 'pri', function () { copyText(JSON.stringify(exportFinals(), null, 1), '已复制全部定稿，发给我就行'); }));
    bar.appendChild(button('复制全部', '', function () { copyText(JSON.stringify({ tool: 'Feel-Lab', time: new Date().toISOString(), items: live() }, null, 1), '已复制全部'); }));
    view.appendChild(bar);
    var any = false;
    M.list.forEach(function (mod) {
      var list = ofModule(mod.id);
      if (!list.length) return;
      any = true;
      view.appendChild(h('h3', 'lib-mod', mod.ico + ' ' + mod.title));
      list.forEach(function (it) { view.appendChild(entryCard(mod, it)); });
    });
    if (!any) view.appendChild(h('p', 'empty', '还没存过。去任意一个模块调到满意，点「存进去」。'));
  }
  function entryCard(mod, it) {
    var c = h('div', 'entry' + (it.final ? ' final' : ''));
    var hd = h('div', 'entry-h'); hd.appendChild(h('span', 'entry-n', it.name)); if (it.final) hd.appendChild(h('span', 'badge ok', '★ 定稿')); c.appendChild(hd);
    var dv = it.device || {};
    c.appendChild(h('p', 'entry-m', (it.time || '') + ' · ' + [dv.os, dv.ver, dv.browser, dv.screen].filter(Boolean).join(' ')));
    var ul = h('ul', 'entry-v');
    (mod.groups || []).forEach(function (g) { g.params.forEach(function (p) {
      if (it.values[p.key] === undefined) return;
      var li = h('li'); li.appendChild(document.createTextNode(p.label + ' ')); var bv = h('b', '', String(it.values[p.key] === true ? '开' : it.values[p.key] === false ? '关' : it.values[p.key]) + (p.unit ? ' ' + p.unit : ''));
      if (it.values[p.key] !== p.default) bv.style.color = 'var(--acc)';
      li.appendChild(bv); ul.appendChild(li);
    }); });
    c.appendChild(ul);
    var acts = h('div', 'entry-acts');
    acts.appendChild(button(it.final ? '取消定稿' : '设为定稿', it.final ? '' : 'pri', function () {
      var t = Date.now();
      ofModule(mod.id).forEach(function (x) { if (x.final && x.id !== it.id) { x.final = false; x.updatedAt = t; } });
      it.final = !it.final; it.updatedAt = t; commit(); route(); toast(it.final ? '已设为定稿' : '已取消定稿');
    }));
    if (!mod.soon) acts.appendChild(button('用这组', '', function () { location.hash = '#/m/' + mod.id + '?use=' + encodeURIComponent(it.id); }));
    acts.appendChild(button('复制', '', function () { copyText(JSON.stringify({ module: mod.id, name: it.name, values: it.values, device: it.device, time: it.time }, null, 1), '已复制「' + it.name + '」'); }));
    acts.appendChild(button('删除', 'danger', function () {
      ask('删除「' + it.name + '」？', client && client.active() ? '开着同步：另一台设备上也会删掉。' : '', '删除', function () {
        var t = Date.now(); it.deletedAt = t; it.updatedAt = t; commit(); route(); toast('已删除');
      }, true);
    }));
    c.appendChild(acts);
    return c;
  }
  function exportFinals() {
    var out = { tool: 'Feel-Lab', time: new Date().toISOString(), finals: {} };
    M.list.forEach(function (mod) { var f = finalOf(mod.id); if (f) out.finals[mod.id] = { title: mod.title, name: f.name, values: f.values, device: f.device, time: f.time }; });
    return out;
  }
  function copyText(text, ok) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(ok); }, fallback);
    else fallback();
    function fallback() { var ta = h('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(ok); } catch (e) { toast('复制不了'); } ta.remove(); }
  }

  /* ---------- 顶部按钮 ---------- */
  $('btnLib').addEventListener('click', function () { location.hash = '#/lib'; });
  $('btnSync').addEventListener('click', openSync);
  route();
})();
