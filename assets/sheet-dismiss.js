/* 下拉关闭底部弹窗（SheetDismiss）—— 原样摘自存档 references/组件_iOS手势/ios-gestures.html 第 256~340 行（那里是嵌在演示页里的，没有单独的文件）。
   用法和四条铁律见那份文件头注释与配方 feedback_ios_gesture_recipe.md §4。 */
function SheetDismiss(o){
  var DEAD = 10;
  var busy = false, timer = 0, g = null, eatIn = null, eatUntil = 0;

  /* 只吞"落在刚才被拉的那个弹窗里"的补发 click，350ms。
     不能用全局守卫：拉掉弹窗后立刻点页面上的按钮（比如 ＋）会被吞，表现成"点了没反应" */
  document.addEventListener("click", function(e){
    if(eatIn && Date.now() < eatUntil && eatIn.contains(e.target)){ eatIn = null; e.stopPropagation(); e.preventDefault(); }
  }, true);

  function reset(S){ S.sheet.style.transition = ""; S.sheet.style.transform = ""; S.mask.style.transition = ""; S.mask.style.backgroundColor = ""; }
  function top(){ var L = o.sheets(); for(var i = L.length - 1; i >= 0; i--) if(!L[i].mask.hidden) return L[i]; return null; }

  document.addEventListener("touchstart", function(e){
    g = null;
    if(busy || e.touches.length !== 1 || (o.blocked && o.blocked())) return;
    var S = top(); if(!S) return;
    var t = e.target;
    if(!S.sheet.contains(t)) return;                       /* 按在遮罩上的，交给"点空白关闭" */
    if(o.skip && t.closest(o.skip)) return;                /* 弹窗里自己会滚的下拉列表等 */
    for(var n = t; n && n !== S.mask; n = n.parentElement){ if(n.scrollTop > 0) return; }   /* 内容没在顶：是在滚内容 */
    var p = e.touches[0];
    g = {S:S, x0:p.clientX, y0:p.clientY, locked:false, dy:0, h:0, samples:[]};
  }, {passive:true});

  document.addEventListener("touchmove", function(e){
    if(!g || !e.touches[0]) return;
    var p = e.touches[0], dx = p.clientX - g.x0, dy = p.clientY - g.y0;
    if(!g.locked){
      if(dy <= 0 || Math.abs(dx) > Math.abs(dy)){ if(Math.abs(dx) >= DEAD || Math.abs(dy) >= DEAD) g = null; return; }
      /* 死区里就先挡住浏览器回弹：iOS 回弹一旦开始，后面的 touchmove 就拦不住了 */
      if(e.cancelable) e.preventDefault();
      if(dy < DEAD) return;
      g.locked = true;
      clearTimeout(timer);
      g.h = g.S.sheet.getBoundingClientRect().height;
      var ae = document.activeElement;
      if(ae && g.S.sheet.contains(ae) && ae.blur) ae.blur();   /* 拉的时候收键盘，跟系统 sheet 一样 */
    }
    if(e.cancelable) e.preventDefault();
    var y = dy - DEAD, now = performance.now();
    g.samples.push({y:p.clientY, t:now});
    while(g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift();
    g.dy = y;
    g.S.sheet.style.transition = "none";
    g.S.sheet.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
    g.S.mask.style.transition = "none";
    g.S.mask.style.backgroundColor = "rgba(12,16,22," + (0.42 * Math.max(0, 1 - y / g.h)).toFixed(3) + ")";
  }, {passive:false});

  function end(cancel){
    if(!g) return;
    var x = g; g = null;
    if(!x.locked) return;
    var S = x.S;
    eatIn = S.mask; eatUntil = Date.now() + 350;
    /* 距离阈值跟着弹窗高度走：矮的确认框拉 80 就够，高的编辑框到 22%（封顶 160） */
    var far = x.dy > Math.min(160, Math.max(80, x.h * 0.22));
    var s0 = x.samples[0], s1 = x.samples[x.samples.length - 1];
    var span = (s0 && s1) ? s1.t - s0.t : 0;
    var v = span >= 30 ? (s1.y - s0.y) / span : 0;       /* px/ms */
    if(s1 && performance.now() - s1.t > 100) v = 0;      /* 停住再松手不算甩 */
    var go = !cancel && (far || (v > 0.6 && x.dy > 30));
    S.sheet.style.transition = "transform .28s cubic-bezier(.2,.8,.3,1)";
    S.mask.style.transition = "background-color .28s ease";
    if(go && S.dirty && S.dirty()){
      S.sheet.style.transform = ""; S.mask.style.backgroundColor = "";
      timer = setTimeout(function(){ reset(S); }, 300);
      o.confirmDiscard(S);
      return;
    }
    if(go){
      busy = true;
      S.sheet.style.transform = "translate3d(0," + Math.ceil(x.h + 24) + "px,0)";
      S.mask.style.backgroundColor = "rgba(12,16,22,0)";
      setTimeout(function(){ S.close(); reset(S); busy = false; }, 280);
    }else{
      S.sheet.style.transform = ""; S.mask.style.backgroundColor = "";
      timer = setTimeout(function(){ reset(S); }, 300);
    }
  }
  document.addEventListener("touchend", function(){ end(false); }, {passive:true});
  document.addEventListener("touchcancel", function(){ end(true); }, {passive:true});
  return { active: function(){ return !!(g && g.locked); } };
}
window.SheetDismiss = SheetDismiss;
