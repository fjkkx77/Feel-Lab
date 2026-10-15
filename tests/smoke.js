// 手感实验室 · 冒烟测试：首页 / 三个模块真能按 / 存进手感库 / 定稿 / 两台设备同步 / 版面
const { open, sleep } = require('./cdp.js');
const URL = process.env.LAB_URL || 'http://127.0.0.1:18901/';
let pass = 0, fail = 0;
const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n + (!c && x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const P = (id, x, y) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
const until = async (c, expr, what, ms) => { const end = Date.now() + (ms || 6000); for (;;) { let v = false; try { v = await c.ev(expr); } catch (e) {} if (v) return v; if (Date.now() > end) throw new Error('等不到：' + what); await sleep(80); } };

(async () => {
  const c = await open(390, 844, 2);
  const t = (type, pts) => c.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const peak = async (sel, hold) => {
    const p = await c.ev(`(function(){ var el = ${sel}; el.scrollIntoView({block:'center'}); var r = el.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
    await sleep(250);
    await c.ev(`(function(){ window.__pk = 1; var el = ${sel}; var n = 0; (function f(){ var s = getComputedStyle(el).scale; s = s === 'none' ? 1 : parseFloat(s); if(Math.abs(s - 1) > Math.abs(window.__pk - 1)) window.__pk = s; if(++n < 50) requestAnimationFrame(f); })(); return 1; })()`);
    await t('touchStart', [P(0, p.x, p.y)]); await sleep(hold || 250); await t('touchEnd', [P(0, p.x, p.y)]); await sleep(900);
    return c.ev('window.__pk');
  };
  try {
    await c.goto(URL); await c.ev('localStorage.clear()'); await c.goto(URL); await sleep(500);
    console.log('\nS1 首页');
    const home = await c.ev(`({ready: document.querySelectorAll('button.mcard').length, soon: document.querySelectorAll('.mcard.soon').length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})`);
    ok(home.ready === 3 && home.soon === 13, `3 个能调、13 个即将推出`, home);
    ok(home.sw <= home.cw, '没有横向溢出', home);
    await c.vshot('shots/home.png');

    console.log('\nS2 按钮按下模块');
    await c.ev(`location.hash = '#/m/press'`); await until(c, `!!document.querySelector('.tp-inline')`, '面板');
    ok(await c.ev(`document.querySelectorAll('.tp-inline .tp-row').length`) === 11, '嵌在页面里的面板，11 个参数');
    let pk = await peak(`document.querySelector('.stage [data-press].round')`);
    ok(pk >= 1.2 && pk < 1.3, `圆形小按钮放大到 ${pk.toFixed(3)}`, pk);
    ok(/放大 ×/.test(await c.ev(`document.querySelector('.tp-readout').textContent`)), '面板上的实测读数在走');
    await c.ev(`(function(){ var i = document.querySelector('.tp-row[data-key="max"] .tp-range'); i.value = 1.4; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);
    pk = await peak(`document.querySelector('.stage [data-press].round')`);
    ok(pk >= 1.39, `拖到 1.4 后：${pk.toFixed(3)}`, pk);
    await c.ev(`document.querySelector('.save-row .inp').value = '大一点'`);
    await c.ev(`[].find.call(document.querySelectorAll('.save-row .btn'), function(b){ return b.textContent === '存进去'; }).click()`); await sleep(300);
    const st = await c.ev(`JSON.parse(localStorage.getItem('feel-lab-v1')).items`);
    ok(st.length === 1 && st[0].name === '大一点' && st[0].values.max === 1.4 && st[0].device && st[0].device.screen, '存进手感库：名字、参数、设备都在', st[0]);
    ok(/已存 1 组/.test(await c.ev(`document.getElementById('savedBox').textContent`)), '模块页显示已存 1 组');
    await c.vshot('shots/press.png');

    console.log('\nS3 卡片模块');
    await c.ev(`location.hash = '#/m/card'`); await until(c, `!!document.querySelector('.stage .fx-card')`, '卡片');
    pk = await peak(`document.querySelector('.stage .fx-card')`);
    ok(Math.abs(pk - .93) < .01, `卡片缩到 ${pk.toFixed(3)}`, pk);
    pk = await peak(`document.querySelector('.stage .fx-li')`);
    ok(pk < .99 && pk > .93, `列表行缩得比卡片少：${pk.toFixed(3)}`, pk);

    console.log('\nS4 开关与勾选');
    await c.ev(`location.hash = '#/m/toggle'`); await until(c, `!!document.querySelector('.stage .fx-sw')`, '开关');
    const sw = `document.querySelector('.stage .fx-sw')`;
    const p = await c.ev(`(function(){ var r = ${sw}.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
    await t('touchStart', [P(0, p.x, p.y)]); await sleep(250);
    const wHeld = await c.ev(`${sw}.querySelector('i').getBoundingClientRect().width`);
    await t('touchEnd', [P(0, p.x, p.y)]); await sleep(800);
    const s4 = await c.ev(`({on: ${sw}.getAttribute('aria-checked'), x: ${sw}.querySelector('i').getBoundingClientRect().left - ${sw}.getBoundingClientRect().left, w: ${sw}.querySelector('i').getBoundingClientRect().width})`);
    ok(wHeld > 30, `按住时滑块拉长到 ${Math.round(wHeld)}px`, wHeld);
    ok(s4.on === 'true' && Math.abs(s4.x - 22) < 2 && Math.abs(s4.w - 27) < 1, '松手：打开、滑块到右边、恢复原宽', s4);
    const row = `document.querySelectorAll('.stage .fx-ck-row')[0]`;
    await c.ev(`${row}.click()`); await sleep(900);
    const ck = await c.ev(`({done: ${row}.classList.contains('done'), dot: getComputedStyle(${row}.querySelector('.fx-ck b')).transform, dash: getComputedStyle(${row}.querySelector('path')).strokeDashoffset, bar: getComputedStyle(${row}.querySelector('.fx-bar')).transform})`);
    ok(ck.done && /matrix\(1, 0, 0, 1/.test(ck.dot) && parseFloat(ck.dash) === 0 && /matrix\(1, 0, 0, 1/.test(ck.bar), '勾上：填色、画出勾、文字划掉', ck);
    await c.ev(`${row}.click()`); await sleep(1100);
    const un = await c.ev(`({done: ${row}.classList.contains('done'), dot: getComputedStyle(${row}.querySelector('.fx-ck b')).transform, dash: getComputedStyle(${row}.querySelector('path')).strokeDashoffset, bar: getComputedStyle(${row}.querySelector('.fx-bar')).transform})`);
    ok(!un.done && /matrix\(0, 0, 0, 0/.test(un.dot) && parseFloat(un.dash) === 16 && /matrix\(0, 0, 0, 1/.test(un.bar), '取消：完整倒放（擦勾、收色、划线收回）', un);
    await c.vshot('shots/toggle.png');

    console.log('\nS5 手感库：定稿');
    await c.ev(`location.hash = '#/lib'`); await until(c, `!!document.querySelector('.entry')`, '库');
    await c.ev(`[].find.call(document.querySelectorAll('.entry .btn'), function(b){ return b.textContent === '设为定稿'; }).click()`); await sleep(300);
    ok(await c.ev(`JSON.parse(localStorage.getItem('feel-lab-v1')).items[0].final`) === true && !!(await c.ev(`document.querySelector('.entry.final')`)), '设为定稿');
    await c.ev(`location.hash = '#/'`); await sleep(400);
    ok(await c.ev(`[].some.call(document.querySelectorAll('.badge.ok'), function(b){ return b.textContent === '已定稿'; })`), '首页：按钮按下显示「已定稿」');
    await c.ev(`location.hash = '#/lib'`); await sleep(300);
    await c.ev(`[].find.call(document.querySelectorAll('.entry .btn'), function(b){ return b.textContent === '用这组'; }).click()`); await until(c, `!!document.querySelector('.tp-inline')`, '模块');
    ok(await c.ev(`document.querySelector('.tp-row[data-key="max"] .tp-val').value`) === '1.40', '「用这组」：回到模块，参数换成那组');
    ok(c.errors.length === 0, '无 JS 报错', c.errors);
  } finally { await c.close(); }

  console.log('\nS6 两台设备：A 存的、A 定稿的，B 填同一个同步码就看到');
  const code = 'lab' + Date.now().toString(36) + 'xyz';
  const a = await open(390, 844, 1), b = await open(390, 844, 1);
  try {
    for (const x of [a, b]) { await x.goto(URL); await x.ev(`localStorage.clear(); localStorage.setItem('feel-lab-sync', JSON.stringify({on: true, code: '${code}'})); 1`); await x.goto(URL); await sleep(800); }
    await a.ev(`location.hash = '#/m/card'`); await until(a, `!!document.querySelector('.save-row .inp')`, 'A 模块');
    await a.ev(`document.querySelector('.save-row .inp').value = 'A 存的'; [].find.call(document.querySelectorAll('.save-row .btn'), function(b){ return b.textContent === '存进去'; }).click(); 1`);
    await sleep(1500);
    await b.ev(`window.dispatchEvent(new Event('focus'))`); await sleep(1500);
    await b.ev(`location.hash = '#/lib'`); await sleep(500);
    ok(/A 存的/.test(await b.ev(`document.getElementById('view').textContent`)), 'B 的手感库里出现「A 存的」');
    ok(/已同步/.test(await b.ev(`document.getElementById('syncLine').textContent`)), 'B 显示「已同步」', await b.ev(`document.getElementById('syncLine').textContent`));
    ok(a.errors.length === 0 && b.errors.length === 0, '两台都无 JS 报错', [a.errors, b.errors]);
  } finally { await a.close(); await b.close(); }

  console.log('\nS7 宽度与深色');
  for (const W of [320, 430]) {
    const d = await open(W, 800, 2);
    try {
      await d.goto(URL + '#/m/press'); await sleep(900);
      const L = await d.ev(`({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth})`);
      ok(L.sw <= L.cw, `${W}：模块页没有横向溢出`, L);
    } finally { await d.close(); }
  }
  const dk = await open(390, 844, 2);
  try {
    await dk.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await dk.goto(URL + '#/m/toggle'); await sleep(900); await dk.vshot('shots/toggle_dark.png');
    ok(dk.errors.length === 0, '深色：无 JS 报错', dk.errors);
  } finally { await dk.close(); }
  console.log(`\n通过 ${pass}，失败 ${fail}`);
  await sleep(1500); process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await sleep(1500); process.exit(2); });
