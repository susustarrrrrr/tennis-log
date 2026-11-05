/* ===========================================================
 *  page-records.js  —  记录列表 + 记录录入/编辑抽屉
 * =========================================================== */
window.Records = (function () {
  var $ = U.$, $$ = U.$$;

  var editing = null;      // 正在编辑的记录（null = 新增）
  var pickedType = null;
  var pickedEffort = 3;

  /* 草稿：正在填但还没点「保存」时自动存到本机，下拉刷新 / 误关页面也不丢 */
  var DRAFT_KEY = 'tl_rec_draft';
  function saveDraft() {
    if (editing) return;                                   // 编辑已有记录不需要草稿
    if ($('#sheet-record').classList.contains('hidden')) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        type_id: pickedType,
        effort: pickedEffort,
        date: $('#rec-date').value,
        duration: $('#rec-duration').value,
        cost: $('#rec-cost').value,
        note: $('#rec-note').value
      }));
    } catch (e) { /* 隐私模式忽略 */ }
  }
  function loadDraft() {
    try { var raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  /* 历史记录按需渲染：默认只画前 50 条，点「查看更早」再追加，避免大量记录卡顿 */
  var RENDER_STEP = 50;
  var renderLimit = RENDER_STEP;
  var lastFilter = null;

  /* ---------------------------------------------------------
   *  列表渲染
   * --------------------------------------------------------- */
  function render() {
    var st = App.state;
    var all = st.records.filter(function (r) { return !r.deleted; });   // 本地优先：已删除的先过滤掉

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
      var n = all.filter(function (r) { return r.type_id === t.client_uuid; }).length;
      var on = st.filterType === t.client_uuid;
      chips.push('<button class="filter-chip tap-on' + (on ? ' active' : '') + '" data-t="' + t.client_uuid + '"' +
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
    var list = st.filterType === 'all' ? all : all.filter(function (r) { return r.type_id === st.filterType; });  // st.filterType 存的是类型的 client_uuid
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

    if (App.updateSyncBanner) App.updateSyncBanner();   // 顶部同步状态横幅
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
    App.state.records.some(function (r) { if (r.client_uuid === id) { out = r; return true; } });
    return out;
  }

  function card(r) {
    var t = App.typeById(r.type_id);
    return '' +
      '<div class="rec" data-id="' + r.client_uuid + '">' +
        '<div class="bar" style="background:' + t.color + '"></div>' +
        '<div class="body">' +
          '<div class="r1">' +
            '<div class="tname"><span class="dot" style="background:' + t.color + '"></span>' + U.esc(t.name) + '</div>' +
            '<div class="date">' + U.fmtDate(r.played_on) + (r.dirty && !r.synced ? ' <span class="psync">待同步</span>' : '') + '</div>' +
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

    pickedType = rec ? rec.type_id : st.types[0].client_uuid;
    if (!App.typeById(pickedType).client_uuid) pickedType = st.types[0].client_uuid;
    pickedEffort = rec ? Number(rec.effort) : 3;

    // 新增时尝试恢复上次未保存的草稿（编辑已有记录不恢复）
    var draft = rec ? null : loadDraft();
    if (draft) {
      if (App.typeById(draft.type_id).id) pickedType = draft.type_id;
      if (draft.effort >= 1 && draft.effort <= 5) pickedEffort = draft.effort;
    }

    $('#rec-date').value = rec ? rec.played_on : (draft ? draft.date : (presetDate || U.todayStr()));
    $('#rec-duration').value = rec ? rec.duration_min : (draft ? draft.duration : '');
    $('#rec-cost').value = rec ? (Number(rec.cost) || '') : (draft ? draft.cost : '');
    $('#rec-note').value = rec ? (rec.note || '') : (draft ? draft.note : '');

    renderTypeChips();
    renderEffort();
    $('#sheet-record').classList.remove('hidden');
  }

  function renderTypeChips() {
    var html = App.state.types.map(function (t) {
      var on = t.client_uuid === pickedType;
      return '<button class="chip' + (on ? ' active' : '') + '" data-id="' + t.client_uuid + '" style="' +
        (on ? 'background:' + t.color + ';color:' + U.inkOn(t.color) : 'color:' + t.color) + '">' +
        U.esc(t.name) + '</button>';
    }).join('');
    $('#rec-types').innerHTML = html;
    $$('#rec-types .chip').forEach(function (c) {
      c.addEventListener('click', function () { pickedType = c.dataset.id; renderTypeChips(); saveDraft(); });
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
      b.addEventListener('click', function () { pickedEffort = +b.dataset.v; renderEffort(); saveDraft(); });
    });
  }

  function closeSheet() { $('#sheet-record').classList.add('hidden'); clearDraft(); }

  /* 时长快捷按钮 */
  $$('#rec-duration-chips .chip').forEach(function (c) {
    c.addEventListener('click', function () { $('#rec-duration').value = c.dataset.min; });
  });

  /* 草稿自动保存：表单任意字段变更即写入本机（下拉刷新 / 误关不丢） */
  ['#rec-date', '#rec-duration', '#rec-cost', '#rec-note'].forEach(function (sel) {
    var el = $(sel); if (el) el.addEventListener('input', saveDraft);
  });

  $('#rec-cancel').addEventListener('click', closeSheet);
  $('#sheet-record').addEventListener('click', function (e) {
    if (e.target === this) closeSheet();
  });

  /* 保存（本地优先：先写本地——唯一真相，立即可见；上传云端是后台可选动作） */
  $('#rec-save').addEventListener('click', function () {
    var dur = parseInt($('#rec-duration').value, 10);
    var date = $('#rec-date').value;
    if (!date) return U.toast('请选择运动日期');
    if (!dur || dur <= 0) return U.toast('请填写运动时长');
    if (dur > 1440) return U.toast('时长最多 1440 分钟');

    var isEdit = !!editing;
    var now = new Date().toISOString();
    // 本地优先：整条记录落到本地存储（新建与编辑共用 client_uuid，天然去重，永不复重）
    var rec = isEdit ? editing : { client_uuid: U.uuid(), created_at: now };
    rec.type_id = pickedType;                 // 存的是「类型的 client_uuid」
    rec.played_on = date;
    rec.duration_min = dur;
    rec.effort = pickedEffort;
    rec.cost = Math.max(0, Number($('#rec-cost').value || 0));
    rec.note = $('#rec-note').value.trim();
    rec.updated_at = now;
    rec.dirty = true;          // 有改动 → 标记待同步云端
    rec.deleted = false;

    AppStore.putRecord(rec);                  // 落盘（client_uuid 相同即就地更新）
    App.state.records = AppStore.loadRecords();
    App.sortRecords();

    closeSheet();
    editing = null;
    App.renderAll();
    U.toast('已存到手机本地' + (App.state.cloudEnabled ? '，正在同步云端…' : ''));
    App.maybeSync();                          // 后台尝试推云端；失败保留，网络恢复/下次打开自动重试
  });

  /* 删除（本地优先：先标记删除并落盘，后台再同步云端；云端删除幂等，不会出错） */
  $('#rec-delete').addEventListener('click', function () {
    if (!editing) return;
    if (editing.deleted) { closeSheet(); editing = null; return; }
    U.confirmBox('确定删除这条打球记录吗？<br><span style="font-size:12px;color:#A79FB0">删除后无法恢复</span>', '删除')
      .then(function (ok) {
        if (!ok) return;
        editing.deleted = true;                // 标记删除（界面立即隐藏）
        editing.dirty = true;                  // 待同步到云端做真实删除
        AppStore.putRecord(editing);
        App.state.records = AppStore.loadRecords();
        closeSheet();
        editing = null;
        App.renderAll();
        U.toast('已删除');
        App.maybeSync();                       // 后台把删除同步到云端（幂等，云端没有也不报错）
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
