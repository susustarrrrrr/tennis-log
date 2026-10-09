/* ===========================================================
 *  page-calendar.js  —  月历视图 + 当日详情弹窗 + 月度汇总
 * =========================================================== */
window.Calendar = (function () {
  var $ = U.$, $$ = U.$$;
  var openedDate = null;

  function cursor() { return App.state.calCursor; }

  function shift(n) {
    var c = cursor();
    App.state.calCursor = new Date(c.getFullYear(), c.getMonth() + n, 1);
    render();
  }

  /** 按日期分组当月记录 */
  function groupByDate(y, m) {
    var map = {};
    App.state.records.forEach(function (r) {
      var d = U.parseDate(r.played_on);
      if (d.getFullYear() === y && d.getMonth() === m) {
        (map[r.played_on] = map[r.played_on] || []).push(r);
      }
    });
    return map;
  }

  function render() {
    var c = cursor();
    var y = c.getFullYear(), m = c.getMonth();
    $('#cal-title').textContent = y + ' 年 ' + (m + 1) + ' 月';

    var map = groupByDate(y, m);
    var first = new Date(y, m, 1);
    var startPad = first.getDay();                       // 周日开头
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var prevDays = new Date(y, m, 0).getDate();
    var todayS = U.todayStr();

    var cells = [];
    // 上月补位
    for (var i = startPad - 1; i >= 0; i--) {
      cells.push('<div class="cal-cell out">' + (prevDays - i) + '</div>');
    }
    // 当月
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + '-' + U.pad(m + 1) + '-' + U.pad(d);
      var recs = map[ds] || [];
      var cls = 'cal-cell' + (recs.length ? ' has' : '') + (ds === todayS ? ' today' : '');
      var style = '', dots = '', mini = '', ball = '';
      if (recs.length) {
        var colors = recs.map(function (r) { return App.typeById(r.type_id).color; });
        var c0 = colors[0];
        style = ' style="--c:' + c0 + ';--ink:' + U.inkOn(c0) + '"';
        var tot = recs.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
        mini = '<span class="cal-dur">' + U.fmtDurShort(tot) + '</span>';
        // 网球缝线：两条严格对称的弯月弧 + 中央白点（用 path 而非 line，跨浏览器一致）
        // 上弧 y∈[7,11]、下弧 y∈[13,17]、中央 y=12；关于 y=12 完美镜像
        ball = '<svg class="cal-ball" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
          '<path d="M 3 7 Q 12 15 21 7" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>' +
          '<path d="M 3 17 Q 12 9 21 17" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>' +
          '<circle cx="12" cy="12" r="0.9" fill="#FFFFFF"/>' +
        '</svg>';
      }
      cells.push('<div class="' + cls + '" data-d="' + ds + '"' + style + '>' +
        '<span class="cal-date">' + d + '</span>' + ball + mini + '</div>');
    }
    // 下月补位（补满整行）
    while (cells.length % 7 !== 0) {
      cells.push('<div class="cal-cell out">' + (cells.length % 7) + '</div>');
    }

    $('#cal-grid').innerHTML = cells.join('');
    $$('#cal-grid .cal-cell[data-d]').forEach(function (el) {
      el.addEventListener('click', function () { openDay(el.dataset.d); });
    });

    /* ---- 本月汇总 ---- */
    var list = [];
    Object.keys(map).forEach(function (k) { list = list.concat(map[k]); });
    var cnt = list.length;
    var min = list.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
    var cost = list.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
    var eff = cnt ? (list.reduce(function (a, r) { return a + Number(r.effort || 0); }, 0) / cnt) : 0;

    $('#cal-summary').innerHTML =
      sumCard('总打球时长', (Math.round(min / 6) / 10) + '<small>小时</small>', 'clock') +
      sumCard('打球次数', cnt + '<small>次</small>', 'tennis') +
      sumCard('总花费', App.costView(cost), 'yuan', true) +
      sumCard('平均耗力', (Math.round(eff * 10) / 10 || 0) + '<small>/5</small>', 'tennis');

    var eb = $('#cal-summary [data-cost-eye]');
    if (eb) eb.addEventListener('click', function (e) { e.stopPropagation(); App.toggleCostHidden(); });

    /* ---- 图例 ---- */
    $('#cal-legend').innerHTML = App.state.types.map(function (t) {
      return '<span class="lg"><i style="background:' + t.color + '"></i>' + U.esc(t.name) + '</span>';
    }).join('');
  }

  function sumCard(k, v, iconName, eye) {
    var eyeBtn = eye
      ? '<button class="eye-btn" data-cost-eye aria-label="隐藏或显示花费">' + U.svg(App.costHidden ? 'eyeOff' : 'eye') + '</button>'
      : '';
    return '<div class="sum-card"><div class="k">' + k + '</div><div class="v">' + v +
      '</div>' + eyeBtn + U.svg(iconName, 'bg-ico') + '</div>';
  }

  /* ---------------------------------------------------------
   *  当日详情
   * --------------------------------------------------------- */
  function openDay(ds) {
    openedDate = ds;
    $$('#cal-grid .cal-cell.sel').forEach(function (c) { c.classList.remove('sel'); });
    var cell = $('#cal-grid .cal-cell[data-d="' + ds + '"]');
    if (cell) cell.classList.add('sel');
    var recs = App.state.records.filter(function (r) { return r.played_on === ds; });
    $('#day-title').textContent = U.fmtDateFull(ds);

    if (!recs.length) {
      $('#day-body').innerHTML = '<div class="empty" style="padding:26px 10px"><div class="empty-emoji">' + U.svg('tennis') + '</div><p>这天没有打球记录</p></div>';
    } else {
      var tot = recs.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
      var cost = recs.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
      var head = '<div class="hint" style="margin:2px 2px 10px">共 ' + recs.length + ' 场 · ' +
        U.fmtDur(tot) + ' · ' + App.costView(cost) + '</div>';
      $('#day-body').innerHTML = head + recs.map(function (r) {
        var t = App.typeById(r.type_id);
        return '<div class="day-rec">' +
          '<div class="bar" style="background:' + t.color + '"></div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="r1" style="display:flex;justify-content:space-between;align-items:center">' +
              '<b style="font-size:14.5px">' + U.esc(t.name) + '</b>' + (r._pending ? ' <span class="psync">同步中</span>' : '') +
              '<button class="edit" data-id="' + r.id + '">编辑</button>' +
            '</div>' +
            '<div class="kv">' +
              '<span class="pill">' + U.svg('clock') + ' ' + U.fmtDur(r.duration_min) + '</span>' +
              '<span class="pill">' + U.svg('tennis') + ' 耗力 ' + r.effort + '/5</span>' +
              '<span class="pill cost">' + (App.costHidden ? '¥ ••••' : ('¥ ' + U.money(r.cost))) + '</span>' +
            '</div>' +
            '<div style="margin-top:6px">' + U.ballsHTML(r.effort) + '</div>' +
            (r.note ? '<div class="note" style="margin-top:7px;font-size:12.5px;color:#A79FB0;white-space:normal">' + U.svg('note') + ' ' + U.esc(r.note) + '</div>' : '') +
          '</div>' +
        '</div>';
      }).join('');

      $$('#day-body .edit').forEach(function (b) {
        b.addEventListener('click', function () {
          var r = Records.find(b.dataset.id);
          closeDay();
          if (r) Records.openSheet(r);
        });
      });
    }
    $('#modal-day').classList.remove('hidden');
  }

  function closeDay() {
    $('#modal-day').classList.add('hidden');
    $$('#cal-grid .cal-cell.sel').forEach(function (c) { c.classList.remove('sel'); });
  }

  $('#day-close').addEventListener('click', closeDay);
  $('#modal-day').addEventListener('click', function (e) { if (e.target === this) closeDay(); });
  $('#day-add').addEventListener('click', function () {
    var d = openedDate;
    closeDay();
    Records.openSheet(null, d);
  });
  $('#cal-prev').addEventListener('click', function () { shift(-1); });
  $('#cal-next').addEventListener('click', function () { shift(1); });

  /* 左右滑动切换月份 */
  (function swipe() {
    var x0 = null, y0 = null;
    var el = U.$('#page-calendar');
    el.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) shift(dx < 0 ? 1 : -1);
      x0 = y0 = null;
    }, { passive: true });
  })();

  return { render: render, shift: shift, openDay: openDay };
})();
