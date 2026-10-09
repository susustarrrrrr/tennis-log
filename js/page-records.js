/* ===========================================================
 *  page-records.js  —  记录列表 + 记录录入/编辑抽屉
 * =========================================================== */
window.Records = (function () {
  var $ = U.$, $$ = U.$$;

  var editing = null;      // 正在编辑的记录（null = 新增）
  var pickedType = null;
  var pickedEffort = 3;

  /* 历史记录按需渲染：默认只画前 50 条，点「查看更早」再追加，避免大量记录卡顿 */
  var RENDER_STEP = 50;
  var renderLimit = RENDER_STEP;
  var lastFilter = null;

  /* ---------------------------------------------------------
   *  列表渲染
   * --------------------------------------------------------- */
  function render() {
    var st = App.state;
    var all = st.records;

    /* 顶部小统计：本月 */
    var thisYm = U.ym(U.todayStr());
    var monthRecs = all.filter(function (r) { return U.ym(r.played_on) === thisYm; });
    var mMin = sum(monthRecs, 'duration_min');
    var mCost = monthRecs.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
    $('#records-strip').innerHTML =
      item(monthRecs.length, '本月次数') +
      item((Math.round(mMin / 6) / 10) + 'h', '本月时长') +
      item(App.costView(mCost), '本月花费', {eye: true});

    var eb = $('#records-strip [data-cost-eye]');
    if (eb) eb.addEventListener('click', function (e) { e.stopPropagation(); App.toggleCostHidden(); });

    /* 类型筛选 */
    var chips = ['<button class="filter-chip tap-on' + (st.filterType === 'all' ? ' active' : '') + '" data-t="all"' +
      (st.filterType === 'all' ? ' style="background:var(--brand-2);color:#fff"' : '') + '>' +
      U.svg('tennis') + '<span>全部 ' + all.length + '</span></button>'];
    st.types.forEach(function (t) {
      var n = all.filter(function (r) { return r.type_id === t.id; }).length;
      var on = st.filterType === t.id;
      chips.push('<button class="filter-chip tap-on' + (on ? ' active' : '') + '" data-t="' + t.id + '"' +
        (on ? ' style="background:' + t.color + ';color:' + U.inkOn(t.color) + '"' : '') + '>' +
        U.svg('tennis') + '<span>' + U.esc(t.name) + ' ' + n + '</span></button>');
    });
    $('#records-filter').innerHTML = chips.join('');
    $$('#records-filter .filter-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        App.state.filterType = c.dataset.t;
        render();
      });
    });

    /* 列表（分页渲染，避免大量历史记录一次性渲染卡顿） */
    var list = st.filterType === 'all' ? all : all.filter(function (r) { return r.type_id === st.filterType; });
    $('#records-empty').classList.toggle('hidden', list.length > 0);

    if (lastFilter !== st.filterType) { renderLimit = RENDER_STEP; lastFilter = st.filterType; }

    var html = '', lastYm = '', shown = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var y = U.ym(r.played_on);
      if (y !== lastYm) {
        lastYm = y;
        var p = y.split('-');
        html += '<div class="month-label">' + p[0] + ' 年 ' + (+p[1]) + ' 月</div>';
      }
      html += card(r);
      shown++;
      if (shown >= renderLimit) break;
    }
    if (list.length > renderLimit) {
      html += '<button class="btn btn-ghost btn-block load-more" id="rec-loadmore">查看更早的 ' + (list.length - renderLimit) + ' 条记录</button>';
    }
    $('#records-list').innerHTML = html;
    $$('#records-list .rec').forEach(function (el) {
      el.addEventListener('click', function () {
        var r = find(el.dataset.id);
        if (r) openSheet(r);
      });
    });
    var lm = $('#rec-loadmore');
    if (lm) lm.addEventListener('click', function () { renderLimit += RENDER_STEP; render(); });
  }

  /* 卡片两行：数字（大字金色） + 描述（4 字小字灰） ，全部水平居中 */
  function item(v, k, opt) {
    opt = opt || {};
    var eye = opt.eye
      ? '<button class="eye-btn" data-cost-eye aria-label="隐藏或显示花费">' + U.svg(App.costHidden ? 'eyeOff' : 'eye') + '</button>'
      : '';
    return '<div class="s-item tap-on">' + eye +
      '<div class="s-meta">' +
        '<b>' + v + '</b>' +
        '<span>' + k + '</span>' +
      '</div></div>';
  }
  function sum(arr, f) { return arr.reduce(function (a, r) { return a + Number(r[f] || 0); }, 0); }
  function find(id) {
    var out = null;
    App.state.records.some(function (r) { if (r.id === id) { out = r; return true; } });
    return out;
  }

  function card(r) {
    var t = App.typeById(r.type_id);
    return '' +
      '<div class="rec" data-id="' + r.id + '">' +
        '<div class="bar" style="background:' + t.color + '"></div>' +
        '<div class="body">' +
          '<div class="r1">' +
            '<div class="tname"><span class="dot" style="background:' + t.color + '"></span>' + U.esc(t.name) + '</div>' +
            '<div class="date">' + U.fmtDate(r.played_on) + (r._pending ? ' <span class="psync">同步中</span>' : '') + '</div>' +
          '</div>' +
          '<div class="r2">' +
            '<span class="pill">' + U.svg('clock') + ' <b class="num">' + U.fmtDur(r.duration_min) + '</b></span>' +
            U.ballsHTML(r.effort) +
            (Number(r.cost) > 0 ? '<span class="pill cost">' + U.svg('coin') + ' <b class="num">¥ ' + U.money(r.cost) + '</b></span>' : '') +
          '</div>' +
          (r.note ? '<div class="note">' + U.svg('note') + ' ' + U.esc(r.note) + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------
   *  抽屉：新增 / 编辑
   * --------------------------------------------------------- */
  function openSheet(rec, presetDate) {
    editing = rec || null;
    $('#rec-title').textContent = rec ? '编辑记录' : '新增记录';
    $('#rec-delete').classList.toggle('hidden', !rec);

    var st = App.state;
    if (!st.types.length) {
      U.toast('先去「我的」里创建一个运动类型吧');
      App.go('settings');
      return;
    }

    pickedType = rec ? rec.type_id : st.types[0].id;
    if (!App.typeById(pickedType).id) pickedType = st.types[0].id;
    pickedEffort = rec ? Number(rec.effort) : 3;

    $('#rec-date').value = rec ? rec.played_on : (presetDate || U.todayStr());
    $('#rec-duration').value = rec ? rec.duration_min : '';
    $('#rec-cost').value = rec ? (Number(rec.cost) || '') : '';
    $('#rec-note').value = rec ? (rec.note || '') : '';

    renderTypeChips();
    renderEffort();
    $('#sheet-record').classList.remove('hidden');
  }

  function renderTypeChips() {
    var html = App.state.types.map(function (t) {
      var on = t.id === pickedType;
      return '<button class="chip' + (on ? ' active' : '') + '" data-id="' + t.id + '" style="' +
        (on ? 'background:' + t.color + ';color:' + U.inkOn(t.color) : 'color:' + t.color) + '">' +
        U.esc(t.name) + '</button>';
    }).join('');
    $('#rec-types').innerHTML = html;
    $$('#rec-types .chip').forEach(function (c) {
      c.addEventListener('click', function () { pickedType = c.dataset.id; renderTypeChips(); });
    });
  }

  function renderEffort() {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<button class="eb' + (i <= pickedEffort ? ' on' : '') + '" data-v="' + i + '">' + U.svg('tennis') + '</button>';
    }
    $('#rec-effort').innerHTML = html;
    $('#rec-effort-label').textContent = pickedEffort + ' / 5 · ' + U.EFFORT_TEXT[pickedEffort];
    $$('#rec-effort .eb').forEach(function (b) {
      b.addEventListener('click', function () { pickedEffort = +b.dataset.v; renderEffort(); });
    });
  }

  function closeSheet() { $('#sheet-record').classList.add('hidden'); }

  /* 时长快捷按钮 */
  $$('#rec-duration-chips .chip').forEach(function (c) {
    c.addEventListener('click', function () { $('#rec-duration').value = c.dataset.min; });
  });

  $('#rec-cancel').addEventListener('click', closeSheet);
  $('#sheet-record').addEventListener('click', function (e) {
    if (e.target === this) closeSheet();
  });

  /* 保存（离线优先：先写本地，后台同步云端，连不上也不丢） */
  $('#rec-save').addEventListener('click', function () {
    var dur = parseInt($('#rec-duration').value, 10);
    var date = $('#rec-date').value;
    if (!date) return U.toast('请选择运动日期');
    if (!dur || dur <= 0) return U.toast('请填写运动时长');
    if (dur > 1440) return U.toast('时长最多 1440 分钟');

    var payload = {
      type_id: pickedType,
      played_on: date,
      duration_min: dur,
      effort: pickedEffort,
      cost: Math.max(0, Number($('#rec-cost').value || 0)),
      note: $('#rec-note').value.trim()
    };

    var isEdit = !!editing;
    var isPendingEdit = isEdit && editing._pending;   // 编辑一条还没同步上去的记录

    // 内容签名：用于去重，避免「以为没存上又存一遍」产生重复记录
    var sig = function (p) {
      return [p.type_id, p.played_on, p.duration_min, p.effort, p.cost, p.note].join('§');
    };

    // 新建记录时，若队列里已有同内容的未同步记录，直接复用其 localId（天然去重）；编辑则沿用原 id
    var localId;
    if (isEdit) {
      localId = editing.id;
    } else {
      var dup = App.Offline.all().filter(function (o) { return o.uid === App.state.user.id && sig(o.payload) === sig(payload); })[0];
      localId = dup ? dup.localId : ('loc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    }

    // 乐观写入：立刻进本地状态（立即可见），标记 _pending。用 localId 作主键，已存在则就地更新（去重）
    var optimistic = { id: localId, _pending: true, user_id: App.state.user.id, created_at: new Date().toISOString() };
    Object.keys(payload).forEach(function (k) { optimistic[k] = payload[k]; });
    var idx = App.state.records.findIndex(function (r) { return r.id === localId; });
    if (idx >= 0) App.state.records[idx] = optimistic;
    else App.state.records.push(optimistic);
    sortRecords();

    if (isPendingEdit) App.Offline.remove(editing.id);   // 编辑未同步记录：旧的那条出队，避免重复
    App.Offline.enqueue({
      localId: localId,
      op: isPendingEdit ? 'create' : (isEdit ? 'update' : 'create'),
      uid: App.state.user.id,
      realId: (isEdit && !isPendingEdit) ? editing.id : null,
      payload: payload
    });

    closeSheet();
    App.renderAll();
    editing = null;
    U.toast('已存到手机本地，正在同步云端…');

    App.flushPending();   // 立即尝试同步；失败则保留，网络恢复/下次打开自动重试
  });

  /* 删除 */
  $('#rec-delete').addEventListener('click', function () {
    if (!editing) return;
    // 还没同步上去的离线记录：直接本地移除 + 出队，不发请求
    if (editing._pending) {
      App.Offline.remove(editing.id);
      App.state.records = App.state.records.filter(function (r) { return r.id !== editing.id; });
      closeSheet(); editing = null; App.renderAll();
      U.toast('已删除（本地）');
      return;
    }
    U.confirmBox('确定删除这条打球记录吗？<br><span style="font-size:12px;color:#A79FB0">删除后无法恢复</span>', '删除')
      .then(function (ok) {
        if (!ok) return;
        var id = editing.id;
        return API.deleteRecord(id).then(function (res) {
          if (res.error) throw res.error;
          App.state.records = App.state.records.filter(function (r) { return r.id !== id; });
          closeSheet();
          editing = null;
          App.renderAll();
          U.toast('已删除');
        });
      }).catch(function (err) { U.toast(API.msg(err)); });
  });

  function sortRecords() {
    App.state.records.sort(function (a, b) {
      if (a.played_on === b.played_on) return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
      return a.played_on < b.played_on ? 1 : -1;
    });
  }

  return { render: render, openSheet: openSheet, find: find, card: card };
})();
