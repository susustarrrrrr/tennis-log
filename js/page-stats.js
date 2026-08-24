/* ===========================================================
 *  page-stats.js  —  统计看板（月 / 年 / 全部）
 * =========================================================== */
window.Stats = (function () {
  var $ = U.$, $$ = U.$$;
  var range = 'month';

  $$('#stats-seg .seg-item').forEach(function (b) {
    b.addEventListener('click', function () {
      range = b.dataset.range;
      $$('#stats-seg .seg-item').forEach(function (x) { x.classList.toggle('active', x === b); });
      render();
    });
  });

  function inRange(r) {
    var now = new Date();
    if (range === 'month') return U.ym(r.played_on) === U.ym(U.dateStr(now));
    if (range === 'year') return String(r.played_on).slice(0, 4) === String(now.getFullYear());
    return true;
  }

  function render() {
    var list = App.state.records.filter(inRange);
    var cnt = list.length;
    var min = list.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
    var cost = list.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
    var eff = cnt ? list.reduce(function (a, r) { return a + Number(r.effort || 0); }, 0) / cnt : 0;
    var days = {};
    list.forEach(function (r) { days[r.played_on] = 1; });

    $('#stats-summary').innerHTML =
      card('打球次数', cnt + '<small>次</small>', 'tennis') +
      card('累计时长', (Math.round(min / 6) / 10) + '<small>小时</small>', 'clock') +
      card('平均单次', (cnt ? Math.round(min / cnt) : 0) + '<small>分钟</small>', 'target') +
      card('累计花费', '¥' + U.money(cost), 'yuan') +
      card('场均花费', '¥' + U.money(cnt ? cost / cnt : 0), 'yuan') +
      card('平均耗力', (Math.round(eff * 10) / 10 || 0) + '<small>/5</small>', 'tennis');

    renderBars();
    renderTypeDist(list, min);
    renderEffortDist(list);
  }

  function card(k, v, iconName) {
    return '<div class="sum-card"><div class="k">' + k + '</div><div class="v">' + v +
      '</div>' + U.svg(iconName, 'bg-ico') + '</div>';
  }

  /* ---- 近 12 个月时长柱状图 ---- */
  function renderBars() {
    var now = new Date();
    var keys = [], labels = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(d.getFullYear() + '-' + U.pad(d.getMonth() + 1));
      labels.push((d.getMonth() + 1) + '月');
    }
    var vals = keys.map(function (k) {
      return App.state.records.reduce(function (a, r) {
        return U.ym(r.played_on) === k ? a + Number(r.duration_min || 0) : a;
      }, 0) / 60;
    });
    var max = Math.max.apply(null, vals.concat([1]));
    // 纯 HTML + flex：数字放进柱体内部贴顶，随柱高浮动（不是整排顶部一行）
    $('#stats-bars').innerHTML = vals.map(function (v, i) {
      var h = v ? Math.max(3, v / max * 100) : 3;
      var txt = v ? (Math.round(v * 10) / 10) : '';
      return '<div class="bar-col">' +
        '<div class="bar-track">' +
          '<div class="bar-fill' + (v ? '' : ' zero') + '" style="height:' + h + '%">' +
            (txt ? '<span class="bar-v">' + txt + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="bar-x">' + labels[i] + '</span>' +
      '</div>';
    }).join('');
  }

  /* 当前选中的类型（筛选），默认看「全部」汇总 */
  var selTypeId = '__all__';

  /* ---- 类型分布：顶部筛选条 + 单张卡片，展示选中类型的 次数/时长/花费/精力 ---- */
  function renderTypeDist(list, totalMin) {
    if (!list.length) { $('#stats-types').innerHTML = emptyLine(); return; }

    // 按类型聚合
    var map = {};
    list.forEach(function (r) {
      var t = App.typeById(r.type_id);
      var key = t.id ? t.id : '__uncat__';
      if (!map[key]) map[key] = { name: t.name, color: t.color, rs: [] };
      map[key].rs.push(r);
    });
    var rows = Object.keys(map).map(function (k) {
      var a = aggType(map[k].name, map[k].color, map[k].rs, totalMin);
      a._key = k;
      return a;
    }).sort(function (a, b) { return b.min - a.min; });
    if (!rows.length) { $('#stats-types').innerHTML = emptyLine(); return; }

    // 选中项失效（如切换时间段后该类型无数据）则回落到「全部」
    var keys = rows.map(function (r) { return r._key; });
    if (selTypeId !== '__all__' && keys.indexOf(selTypeId) === -1) selTypeId = '__all__';

    // 筛选 chip：全部 + 每个类型
    function chip(key, name, color) {
      var on = key === selTypeId ? ' on' : '';
      var dot = key === '__all__' ? '' : '<span class="tc-dot" style="background:' + color + '"></span>';
      return '<button class="tc-chip' + on + '" data-k="' + key + '">' + dot + U.esc(name) + '</button>';
    }
    var chips = chip('__all__', '全部', null) +
      rows.map(function (r) { return chip(r._key, r.name, r.color); }).join('');

    // 选中项明细
    var detail;
    if (selTypeId === '__all__') {
      detail = aggType('全部', 'var(--brand-2)', list, totalMin);
      detail._all = true;
    } else {
      detail = rows.filter(function (r) { return r._key === selTypeId; })[0] || rows[0];
    }

    $('#stats-types').innerHTML =
      '<div class="tc-chips">' + chips + '</div>' +
      typeCard(detail);

    // 点击 chip 切换（只重绘卡片 + 高亮，页面高度恒定）
    $('#stats-types').querySelectorAll('.tc-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        selTypeId = b.getAttribute('data-k');
        renderTypeDist(list, totalMin);
      });
    });
  }

  /* 聚合单个类型：次数 / 总时长 / 总花费 / 平均精力 */
  function aggType(name, color, rs, totalMin) {
    var cnt = rs.length;
    var min = rs.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
    var cost = rs.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
    var eff = cnt ? rs.reduce(function (a, r) { return a + Number(r.effort || 0); }, 0) / cnt : 0;
    return { name: name, color: color, cnt: cnt, min: min, cost: cost, eff: Math.round(eff * 10) / 10, totalMin: totalMin };
  }

  function metric(v, k) {
    return '<div class="tc-m"><div class="tc-mv">' + v + '</div><div class="tc-mk">' + k + '</div></div>';
  }

  /* 单张类型卡片：配色用类型色，指标按 时长 / 花费 / 精力 三列布局 */
  function typeCard(r) {
    var dur = Math.round(r.min / 6) / 10;            // 分钟 → 小时（保留 1 位）
    var pct = r.totalMin ? Math.round(r.min / r.totalMin * 100) : 0;
    return '<div class="tc-card">' +
      '<div class="tc-head">' +
        '<span class="tc-dot" style="background:' + r.color + '"></span>' +
        '<span class="tc-name">' + U.esc(r.name) + '</span>' +
        '<span class="tc-cnt">' + r.cnt + ' 次</span>' +
      '</div>' +
      '<div class="tc-grid">' +
        metric((dur || 0) + 'h', '时长') +
        metric('¥' + U.money(r.cost), '花费') +
        metric((r.eff || 0) + '<small>/5</small>', '精力') +
      '</div>' +
      '<div class="tc-bar"><i style="width:' + pct + '%;background:' + r.color + '"></i></div>' +
      '<div class="tc-bar-cap">' + (r._all ? '全部类型合计' : pct + '% 时长占比') + '</div>' +
    '</div>';
  }

  /* ---- 耗力分布 ---- */
  function renderEffortDist(list) {
    if (!list.length) { $('#stats-effort').innerHTML = emptyLine(); return; }
    var buckets = [0, 0, 0, 0, 0, 0];
    list.forEach(function (r) { buckets[Number(r.effort) || 3]++; });
    var max = Math.max.apply(null, buckets.slice(1).concat([1]));
    var colors = ['', '#BFE9CF', '#86D9BE', '#FFD98A', '#FFC89B', '#FFAFC0'];

    var html = '';
    for (var i = 1; i <= 5; i++) {
      var p = Math.round(buckets[i] / max * 100);
      html += '<div class="dist-row">' +
        '<div class="dr1"><span>' + U.svg('tennis') + ' ' + U.EFFORT_TEXT[i] + '</span><span>' + buckets[i] + ' 次</span></div>' +
        '<div class="track"><i style="width:' + p + '%;background:' + colors[i] + '"></i></div>' +
      '</div>';
    }
    $('#stats-effort').innerHTML = html;
  }

  function emptyLine() {
    return '<div class="hint center" style="padding:14px 0">这个时间段还没有数据~</div>';
  }

  return { render: render };
})();
