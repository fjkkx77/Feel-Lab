/* 手感实验室 · 模块
   每个模块：{ id, ico, title, desc, groups（给调手感面板的参数）, curves, refs（参照：每条标来源）, src（每个参数的默认值从哪来）, mount(stage, tp) → 清理函数 }
   参数来源只许四种（+ 用户真机调定），见记忆 feedback_apple_interaction_reference 开头：
     off 官方原文 / 3rd 第三方 / der 推导 / me 我定的起点（没有依据，等你调）/ user 用户真机调定 */
(function (root) {
  'use strict';

  /* ---------- 共用小工具 ---------- */
  function springVals(a, b, resp, bounce) { return root.TunePanel.springCurve(resp, bounce).map(function (x) { return a + (b - a) * x; }); }
  function animateProp(el, prop, a, b, resp, bounce, extra) {
    var vals = springVals(a, b, resp, bounce);
    var frames = vals.map(function (v, i) { var k = { offset: i / (vals.length - 1) }; k[prop] = String(v); if (extra) for (var e in extra) k[e] = extra[e]; return k; });
    return el.animate(frames, { duration: Math.max(16, (vals.length - 1) / 120 * 1000), easing: 'linear', fill: 'forwards' });
  }
  function css(id, text) { if (document.getElementById(id)) return; var s = document.createElement('style'); s.id = id; s.textContent = text; document.head.appendChild(s); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  var GLOW_OK = false;
  try { CSS.registerProperty({ name: '--pg-r', syntax: '<percentage>', inherits: false, initialValue: '0%' }); CSS.registerProperty({ name: '--pg-a', syntax: '<number>', inherits: false, initialValue: '0' }); GLOW_OK = true; }
  catch (e) { GLOW_OK = !!(root.CSS && CSS.registerProperty); /* 已经注册过也算有 */ }
  function darkBg(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var bg = getComputedStyle(n).backgroundColor, m = (bg.match(/[\d.]+/g) || []).map(Number);
      if (/^color\(/.test(bg)) m = m.map(function (v, i) { return i < 3 ? v * 255 : v; });
      if (m.length >= 3 && (m.length < 4 || m[3] > .5)) return (.2126 * m[0] + .7152 * m[1] + .0722 * m[2]) / 255 < .62;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ---------- 通用「按下」引擎：放大（控件）或缩小（卡片）+ 指尖光晕 + 弹簧回弹 ----------
     和日程卡片 v3 同一套算法（index.html 的 pressStart / pressEnd），这里参数全从面板取 */
  function pressEngine(stage, tp, kindOf) {
    var now = null;
    function down(e) {
      var t = e.target.closest('[data-press]');
      if (!t || !stage.contains(t)) return;
      up(true);
      var v = tp.values(), kind = kindOf(t), r = t.getBoundingClientRect();
      var p = { el: t, t0: performance.now(), x: e.clientX, y: e.clientY, anims: [], kind: kind };
      now = p;
      if (kind === 'grow' && GLOW_OK && v.glowOn !== false) {
        var dark = darkBg(t);
        t.style.setProperty('--pg-x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        t.style.setProperty('--pg-y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        t.style.setProperty('--pg-rgb', dark ? '255,255,255' : '47,134,246');
        t.style.setProperty('--pg-max', String(dark ? v.glowD : v.glowL));
        t.classList.add('fx-glow'); p.glow = true;
        p.anims.push(t.animate([{ '--pg-r': '0%', '--pg-a': '0' }, { '--pg-r': '150%', '--pg-a': '1' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      p.s = kind === 'grow' ? Math.max(v.min, Math.min(v.max, 1 + 2 * v.grow / (r.width || 44))) : (kind === 'row' ? 1 - (1 - v.card) * (v.rowK != null ? v.rowK : .75) : v.card);
      if (kind === 'grow') { t.style.position = getComputedStyle(t).position === 'static' ? 'relative' : t.style.position; t.style.zIndex = '5'; }
      p.anims.push(animateProp(t, 'scale', 1, p.s, v.inR, v.inB));
    }
    function up(cancel) {
      var p = now; if (!p) return; now = null;
      var v = tp.values();
      setTimeout(function () {
        var cs = getComputedStyle(p.el);
        if (p.glow) {
          var g = p.el.animate([{ '--pg-r': cs.getPropertyValue('--pg-r').trim() || '150%', '--pg-a': cs.getPropertyValue('--pg-a').trim() || '1' }, { '--pg-r': '190%', '--pg-a': '0' }], { duration: cancel ? 160 : 420, easing: 'ease-out', fill: 'forwards' });
          g.onfinish = function () { p.el.classList.remove('fx-glow'); g.cancel(); };
        }
        if (p.s) {
          var s0 = parseFloat(cs.scale) || p.s;
          var back = cancel ? p.el.animate([{ scale: String(s0) }, { scale: '1' }], { duration: 160, fill: 'forwards' }) : animateProp(p.el, 'scale', s0, 1, v.outR, v.outB);
          back.onfinish = function () { back.cancel(); p.el.style.zIndex = ''; };
          if (!cancel) {
            var over = springVals(s0, 1, v.outR, v.outB), lim = p.s > 1 ? Math.min.apply(null, over) : Math.max.apply(null, over);
            tp.note('上次按下：' + (p.s > 1 ? '放大 ×' : '缩小 ×') + p.s.toFixed(3) + '，松开回弹到 ×' + lim.toFixed(3));
          }
        }
        p.anims.forEach(function (a) { a.cancel(); });
      }, cancel ? 0 : Math.max(0, v.hold - (performance.now() - p.t0)));
    }
    function move(e) { if (now && (Math.abs(e.clientX - now.x) > 10 || Math.abs(e.clientY - now.y) > 10)) up(true); }
    var onUp = function () { up(false); }, onCancel = function () { up(true); };
    stage.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onCancel); document.addEventListener('pointermove', move);
    return function () { stage.removeEventListener('pointerdown', down); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel); document.removeEventListener('pointermove', move); };
  }
  css('fx-common', [
    '.fx-glow{background-image:radial-gradient(circle at var(--pg-x,50%) var(--pg-y,50%), rgba(var(--pg-rgb,255,255,255), calc(var(--pg-a) * var(--pg-max,.4))) 0%, rgba(var(--pg-rgb,255,255,255),0) var(--pg-r)) !important}',
    '.fx-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;margin:10px 0}',
    '.fx-btn{min-height:46px;padding:0 20px;border:0;border-radius:14px;background:var(--surface-2);color:var(--text);font-weight:700;font-size:16px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
    '.fx-btn.pri{background:#2f86f6;color:#fff}',
    '.fx-btn.wide{width:100%}',
    '.fx-btn.round{width:46px;padding:0;border-radius:50%;font-size:20px}',
    '.fx-btn.chip{min-height:38px;padding:0 14px;border-radius:999px;font-size:14px}',
    '.fx-card{width:100%;border:0;text-align:left;border-radius:18px;background:var(--surface-2);padding:16px;font-weight:700;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
    '.fx-card small{display:block;font-weight:500;color:var(--text-3)}',
    '.fx-card .big{float:right;font-size:34px;line-height:1;font-weight:800}',
    '.fx-list{border-radius:14px;overflow:hidden;background:var(--surface-2)}',
    '.fx-li{display:flex;justify-content:space-between;width:100%;border:0;background:transparent;padding:14px 16px;font-weight:600;border-top:1px solid var(--line);touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
    '.fx-li:first-child{border-top:0}'
  ].join('\n'));

  /* ================= 模块 1：按钮按下 ================= */
  var PRESS = {
    id: 'press', ico: '👆', title: '按钮按下', desc: '按钮按下时鼓起来、指尖亮起光晕、松开 Q 弹回去（iOS 26 液态玻璃的方向）。',
    groups: [{ title: '放大', params: [
      { key: 'max', label: '小按钮放大到', unit: '倍', min: 1.02, max: 1.5, step: .01, default: 1.22, hint: '44px 左右的图标按钮按下时放到多少倍' },
      { key: 'min', label: '宽按钮至少放大到', unit: '倍', min: 1, max: 1.3, step: .01, default: 1.08, hint: '整行宽的按钮至少放多少倍' },
      { key: 'grow', label: '放大力度（边缘外扩）', unit: 'px', min: 2, max: 24, step: 1, default: 10, hint: '按下时边缘往外扩多少 px，再夹在上面两个之间——宽的少放、窄的多放，看上去力度一样' }
    ] }, { title: '弹簧', params: [
      { key: 'inB', label: '按下的弹性', min: 0, max: .8, step: .05, default: .35, hint: '0＝不弹；越大按下去越会冲过头一点' },
      { key: 'inR', label: '按下的时长', unit: '秒', min: .1, max: .8, step: .02, default: .26 },
      { key: 'outB', label: '松开的弹性', min: 0, max: .85, step: .05, default: .5, hint: '越大越 Q' },
      { key: 'outR', label: '松开的时长', unit: '秒', min: .2, max: 1.2, step: .02, default: .5 },
      { key: 'hold', label: '按下至少停', unit: '毫秒', min: 0, max: 400, step: 10, default: 140, hint: '快点一下时按下的样子至少保留多久' }
    ] }, { title: '光晕', params: [
      { key: 'glowOn', label: '指尖光晕', type: 'toggle', default: true },
      { key: 'glowL', label: '浅色按钮光晕亮度', min: 0, max: 1, step: .05, default: .35 },
      { key: 'glowD', label: '彩色/深色按钮光晕亮度', min: 0, max: 1, step: .05, default: .6 }
    ] }],
    curves: [{ label: '按下', resp: 'inR', bounce: 'inB' }, { label: '松开', resp: 'outR', bounce: 'outB' }],
    refs: [
      { k: 'off', t: 'WWDC25「Meet Liquid Glass」：「Liquid Glass responds to interaction by instantly flexing and energizing with light」「Starting right under your fingertips, the glow spreads throughout the element」', url: 'https://developer.apple.com/videos/play/wwdc2025/219/' },
      { k: 'off', t: 'SwiftUI Spring 文档：.bouncy 默认时长 0.5 秒、基础弹性 0.3；.snappy 0.5 秒、0.15', url: 'https://developer.apple.com/documentation/swiftui/spring/bouncy(duration:extrabounce:)' },
      { k: 'off', t: 'HIG Buttons：「Always include a press state for a custom button」', url: 'https://developer.apple.com/design/human-interface-guidelines/buttons' },
      { k: '3rd', t: 'MacStories iOS 26 评测：按下的按钮「animates with a highlighted and "elevated" state」', url: 'https://www.macstories.net/stories/ios-and-ipados-26-the-macstories-review/3/' }
    ],
    src: { max: 'me', min: 'me', grow: 'me', inB: 'me', inR: 'me', outB: 'der', outR: 'off', hold: 'me', glowOn: 'off', glowL: 'me', glowD: 'me' },
    srcNote: { outB: '官方 .bouncy 基础弹性 0.3 + 0.2', outR: '.bouncy 默认 0.5 秒', glowOn: 'WWDC25：从指尖开始发光' },
    mount: function (stage, tp) {
      stage.innerHTML = '<div class="fx-row"><button class="fx-btn pri" data-press>保存</button><button class="fx-btn" data-press>取消</button><button class="fx-btn round" data-press aria-label="更多">⋯</button><button class="fx-btn round pri" data-press aria-label="新增">＋</button></div>' +
        '<div class="fx-row"><button class="fx-btn chip" data-press>不分组</button><button class="fx-btn chip pri" data-press>节假日</button><button class="fx-btn chip" data-press>＋ 新建分组</button></div>' +
        '<div class="fx-row"><button class="fx-btn wide" data-press>整行宽的按钮</button></div>' +
        '<p class="hint">点一点、按住再松开、快点一下都试试。数值看上面面板顶部的「实测读数」。</p>';
      return pressEngine(stage, tp, function () { return 'grow'; });
    }
  };

  /* ================= 模块 2：卡片 / 列表行按下 ================= */
  var CARD = {
    id: 'card', ico: '🃏', title: '卡片 / 列表行按下', desc: '整张卡片、列表里的一行按下时缩小，松开 Q 弹回来。',
    groups: [{ title: '缩小', params: [
      { key: 'card', label: '卡片按下缩到', unit: '倍', min: .8, max: 1, step: .005, default: .93 },
      { key: 'rowK', label: '列表行缩的比例', min: 0, max: 1, step: .05, default: .75, hint: '列表行按卡片缩的幅度再乘这个数（1＝和卡片一样）' }
    ] }, { title: '弹簧', params: [
      { key: 'inB', label: '按下的弹性', min: 0, max: .8, step: .05, default: .35 },
      { key: 'inR', label: '按下的时长', unit: '秒', min: .1, max: .8, step: .02, default: .26 },
      { key: 'outB', label: '松开的弹性', min: 0, max: .85, step: .05, default: .5 },
      { key: 'outR', label: '松开的时长', unit: '秒', min: .2, max: 1.2, step: .02, default: .5 },
      { key: 'hold', label: '按下至少停', unit: '毫秒', min: 0, max: 400, step: 10, default: 140 }
    ] }],
    curves: [{ label: '松开', resp: 'outR', bounce: 'outB' }],
    refs: [
      { k: 'off', t: 'HIG Motion：「Strive for realistic feedback motion that follows people’s gestures and expectations」「Aim for brevity and precision in feedback animations」', url: 'https://developer.apple.com/design/human-interface-guidelines/motion' },
      { k: 'me', t: '卡片「按下缩小」这个方向 Apple 没有原文；日程卡片里用的就是这个方向，0.93 是 v3 起点，等你调定' }
    ],
    src: { card: 'me', rowK: 'me', inB: 'me', inR: 'me', outB: 'der', outR: 'off', hold: 'me' },
    srcNote: { outB: '官方 .bouncy 0.3 + 0.2', outR: '.bouncy 默认 0.5 秒' },
    mount: function (stage, tp) {
      stage.innerHTML = '<button class="fx-card" data-press data-kind="card"><span class="big">87<small style="display:inline;font-size:14px"> 天</small></span>回家过年啦<small>目标 2027-01-10 星期日</small></button>' +
        '<div style="height:12px"></div><div class="fx-list"><button class="fx-li" data-press data-kind="row"><span>四级考试</span><span>59 天</span></button><button class="fx-li" data-press data-kind="row"><span>我的生日</span><span>63 天</span></button><button class="fx-li" data-press data-kind="row"><span>交房租</span><span>5 天</span></button></div>' +
        '<p class="hint">卡片和列表行分开调：列表行很宽，缩一样多会显得很重。</p>';
      return pressEngine(stage, tp, function (t) { return t.dataset.kind === 'row' ? 'row' : 'card'; });
    }
  };

  /* ================= 模块 3：开关与勾选 ================= */
  var TOGGLE = {
    id: 'toggle', ico: '✅', title: '开关与勾选', desc: 'iOS 式开关：按住滑块拉长、松手弹过去；「提醒事项」式勾选：圈鼓一下填色、画出勾、文字划掉，取消时完整倒放。',
    groups: [{ title: '开关', params: [
      { key: 'swR', label: '滑块移动的时长', unit: '秒', min: .1, max: 1, step: .02, default: .35 },
      { key: 'swB', label: '滑块的弹性', min: 0, max: .7, step: .05, default: .3 },
      { key: 'swStretch', label: '按住时滑块拉长', unit: 'px', min: 0, max: 14, step: 1, default: 7 },
      { key: 'swColor', label: '底色变化时长', unit: '毫秒', min: 0, max: 600, step: 20, default: 240 }
    ] }, { title: '勾选', params: [
      { key: 'ckPop', label: '圈鼓起来到', unit: '倍', min: 1, max: 1.6, step: .02, default: 1.24 },
      { key: 'ckR', label: '鼓起回弹时长', unit: '秒', min: .15, max: 1, step: .02, default: .42 },
      { key: 'ckB', label: '鼓起回弹弹性', min: 0, max: .8, step: .05, default: .45 },
      { key: 'ckDraw', label: '画勾时长', unit: '毫秒', min: 60, max: 800, step: 20, default: 260 },
      { key: 'ckStrike', label: '划掉文字时长', unit: '毫秒', min: 0, max: 800, step: 20, default: 300 }
    ] }],
    curves: [{ label: '滑块', resp: 'swR', bounce: 'swB' }, { label: '勾选鼓起', resp: 'ckR', bounce: 'ckB' }],
    refs: [
      { k: 'off', t: 'HIG Toggles：开关「The default green color tends to work well in most cases」', url: 'https://developer.apple.com/design/human-interface-guidelines/toggles' },
      { k: 'off', t: 'HIG Motion：「Aim for brevity and precision in feedback animations」', url: 'https://developer.apple.com/design/human-interface-guidelines/motion' },
      { k: 'me', t: '勾选动画（鼓一下、画勾、划掉、取消完整倒放）照的是 day-rail 里你认可过的「提醒事项」式做法；具体时长都是我定的起点' }
    ],
    src: { swR: 'me', swB: 'me', swStretch: 'me', swColor: 'me', ckPop: 'me', ckR: 'me', ckB: 'me', ckDraw: 'me', ckStrike: 'me' },
    srcNote: {},
    mount: function (stage, tp) {
      css('fx-toggle', [
        '.fx-sw-row{display:flex;align-items:center;justify-content:space-between;padding:12px 4px;border-bottom:1px solid var(--line);font-weight:600}',
        '.fx-sw{position:relative;width:51px;height:31px;border:0;border-radius:999px;background:#e5e5ea;padding:0;flex:0 0 auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
        '@media (prefers-color-scheme:dark){.fx-sw{background:#39393d}}',
        '.fx-sw[aria-checked="true"]{background:#34c759}',
        '.fx-sw i{position:absolute;left:2px;top:2px;height:27px;width:27px;border-radius:999px;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15),0 3px 1px rgba(0,0,0,.06)}',
        '.fx-ck-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 4px;border:0;background:transparent;text-align:left;border-bottom:1px solid var(--line);touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
        '.fx-ck{position:relative;flex:0 0 auto;width:24px;height:24px;border-radius:50%;box-shadow:inset 0 0 0 1.8px #c7c7cc}',
        '.fx-ck b{position:absolute;inset:0;border-radius:50%;background:#2f86f6;transform:scale(0)}',
        '.fx-ck svg{position:absolute;inset:0;width:24px;height:24px}',
        '.fx-ck path{fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:14 20;stroke-dashoffset:16}   /* 藏起来时停在空隙里 2px：正好停在 14 时圆头线帽会画出一个小点 */',
        '.fx-ck-t{position:relative;font-weight:600}',
        '.fx-ck-row.done .fx-ck-t{color:var(--text-3)}',
        '.fx-bar{position:absolute;left:0;right:0;top:52%;height:1.5px;background:currentColor;transform-origin:left center;transform:scaleX(0);pointer-events:none}'
      ].join('\n'));
      stage.innerHTML = '<div class="fx-sw-row"><span>飞行模式</span><button class="fx-sw" role="switch" aria-checked="false" aria-label="飞行模式"><i></i></button></div>' +
        '<div class="fx-sw-row"><span>无线局域网</span><button class="fx-sw" role="switch" aria-checked="true" aria-label="无线局域网"><i></i></button></div>' +
        ['买菜', '交房租', '给妈妈打电话'].map(function (t) { return '<button class="fx-ck-row"><span class="fx-ck"><b></b><svg viewBox="0 0 24 24"><path d="M7 12.5l3.3 3.2L17 9"/></svg></span><span class="fx-ck-t">' + t + '</span></button>'; }).join('') +
        '<p class="hint">开关：点一下、按住看滑块拉长。勾选：勾上再取消，看倒放是不是完整。</p>';
      /* 开关 */
      var sws = [].slice.call(stage.querySelectorAll('.fx-sw'));
      function knobX(sw) { return sw.getAttribute('aria-checked') === 'true' ? 20 : 0; }
      sws.forEach(function (sw) { sw.querySelector('i').style.transform = 'translateX(' + knobX(sw) + 'px)'; });
      var held = null;
      function swDown(e) {
        var sw = e.target.closest('.fx-sw'); if (!sw) return;
        held = sw; var v = tp.values(), on = sw.getAttribute('aria-checked') === 'true', k = sw.querySelector('i');
        k.animate([{ width: '27px', transform: 'translateX(' + knobX(sw) + 'px)' }, { width: (27 + v.swStretch) + 'px', transform: 'translateX(' + (on ? 20 - v.swStretch : 0) + 'px)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      }
      function swUp() {
        var sw = held; if (!sw) return; held = null;
        var v = tp.values(), k = sw.querySelector('i');
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        sw.style.transition = 'background-color ' + v.swColor + 'ms ease';
        var from = parseFloat((getComputedStyle(k).transform.match(/matrix\(([^)]+)\)/) || [0, '1,0,0,1,0,0'])[1].split(',')[4]) || 0;
        var to = on ? 20 : 0, w0 = k.getBoundingClientRect().width;
        k.getAnimations().forEach(function (a) { a.cancel(); });
        var vals = springVals(0, 1, v.swR, v.swB);
        k.animate(vals.map(function (p, i) { return { offset: i / (vals.length - 1), transform: 'translateX(' + (from + (to - from) * p).toFixed(2) + 'px)', width: (w0 + (27 - w0) * Math.min(1, p)).toFixed(2) + 'px' }; }),
                  { duration: (vals.length - 1) / 120 * 1000, easing: 'linear' }).onfinish = function () { k.style.transform = 'translateX(' + to + 'px)'; };
        k.style.transform = 'translateX(' + to + 'px)';
        tp.note('开关：滑块 ' + v.swR + ' 秒、弹性 ' + v.swB + '，冲过头 ' + Math.max(0, (Math.max.apply(null, vals) - 1) * 20).toFixed(1) + 'px');
      }
      function swCancel() { if (!held) return; var k = held.querySelector('i'); k.getAnimations().forEach(function (a) { a.cancel(); }); held = null; }
      /* 勾选 */
      function ck(e) {
        var row = e.target.closest('.fx-ck-row'); if (!row || !stage.contains(row)) return;
        var v = tp.values(), done = !row.classList.contains('done'), dot = row.querySelector('.fx-ck b'), path = row.querySelector('path'), line = row.querySelector('.fx-ck-t'), box = row.querySelector('.fx-ck');
        row.classList.toggle('done', done);
        dot.getAnimations().forEach(function (a) { a.cancel(); }); path.getAnimations().forEach(function (a) { a.cancel(); });
        if (done) {
          var pop = springVals(v.ckPop, 1, v.ckR, v.ckB);
          box.animate([{ scale: '1' }, { scale: String(v.ckPop) }], { duration: 90, fill: 'forwards' }).onfinish = function () {
            box.animate(pop.map(function (s) { return { scale: String(s) }; }), { duration: (pop.length - 1) / 120 * 1000, fill: 'forwards' });
          };
          dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
          path.animate([{ strokeDashoffset: 16 }, { strokeDashoffset: 0 }], { duration: v.ckDraw, delay: 90, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
          strike(line, 0, 1, v.ckStrike, 90 + v.ckDraw * .4);
        } else {      /* 取消：完整倒放——擦勾、收色、文字恢复，圈也轻轻弹一下 */
          path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 16 }], { duration: v.ckDraw * .8, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
          dot.animate([{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: 180, delay: v.ckDraw * .5, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
          var pop2 = springVals(1 + (v.ckPop - 1) * .5, 1, v.ckR, v.ckB);
          box.animate(pop2.map(function (s) { return { scale: String(s) }; }), { duration: (pop2.length - 1) / 120 * 1000, delay: v.ckDraw * .5, fill: 'forwards' });
          strike(line, 1, 0, v.ckStrike * .8, 0);
        }
        tp.note('勾选：鼓起到 ×' + v.ckPop + '，画勾 ' + v.ckDraw + ' 毫秒' + (done ? '' : '（取消：倒放）'));
      }
      /* 划掉文字：伪元素没法单独做动画，用一个真实的细线元素 */
      function strike(line, a, b, ms, delay) {
        var bar = line.querySelector('.fx-bar');
        if (!bar) { bar = document.createElement('i'); bar.className = 'fx-bar'; line.appendChild(bar); }
        bar.getAnimations().forEach(function (x) { x.cancel(); });
        bar.animate([{ transform: 'scaleX(' + a + ')' }, { transform: 'scaleX(' + b + ')' }], { duration: Math.max(1, ms), delay: delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      }
      stage.addEventListener('pointerdown', swDown);
      document.addEventListener('pointerup', swUp);
      document.addEventListener('pointercancel', swCancel);
      stage.addEventListener('click', ck);
      return function () { stage.removeEventListener('pointerdown', swDown); document.removeEventListener('pointerup', swUp); document.removeEventListener('pointercancel', swCancel); stage.removeEventListener('click', ck); };
    }
  };

  /* ================= 后续模块（设计稿里列了，第 3 步补齐） ================= */
  function soon(id, ico, title, desc) { return { id: id, ico: ico, title: title, desc: desc, soon: true }; }
  var LIST = [PRESS, CARD, TOGGLE,
    soon('swipe', '👈', '左滑露出操作', '跟手阻尼、展开阈值、弹回速度'),
    soon('sheet', '⬇️', '下拉关闭弹窗', '阻尼、关闭阈值、甩动速度'),
    soon('ptr', '🔄', '下拉刷新', '死区、阻尼、触发距离'),
    soon('drag', '✋', '长按拖动排序', '长按时长、拿起放大、边缘自动滚、落位弹簧'),
    soon('pager', '📖', '左右滑动翻页', '翻页阈值、甩动速度、弹簧'),
    soon('scroll', '🛝', '惯性滚动与橡皮筋', '减速率、到头的阻尼'),
    soon('zoom', '🔍', '看图缩放', '捏合跟手、双击倍数、惯性'),
    soon('popover', '💬', '弹窗 / 菜单弹出', '从点击处展开、弹性'),
    soon('sheetin', '🪟', '底部弹窗进出场', '进场弹簧、遮罩深浅'),
    soon('seg', '🎚️', '切换标签 / 分段控件', '滑块跟随的弹簧'),
    soon('number', '🔢', '数字滚动', '跳动方式、时长'),
    soon('toast', '🔔', '提示条出现消失', '弹入、停留时长'),
    soon('largetitle', '🔠', '大标题随滚动收缩', '收缩速度、模糊材质')
  ];
  root.FeelModules = { list: LIST, byId: function (id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; } };
})(window);
