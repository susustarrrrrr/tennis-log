/* ===========================================================
 *  utils.js  —  通用小工具
 * =========================================================== */
window.U = (function () {

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- 统一线性 SVG 图标 ---------- */
  var ICONS = {
    tennis:   '<circle cx="12" cy="12" r="9"/><path d="M3.4 9.4c5.2 2 12 2 17.2 0M3.4 14.6c5.2-2 12-2 17.2 0"/>',
    tennisStack: '<circle cx="9" cy="15" r="4.2"/><circle cx="15" cy="15" r="4.2"/><circle cx="12" cy="8.6" r="4.2"/><path d="M6.9 13.5c1.5.8 3.8.8 4.4 0M12.9 13.5c1.5.8 3.8.8 4.4 0M10.1 6.6c1.4.7 2.5.7 3 0"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    coin:     '<circle cx="12" cy="12" r="8.5"/><path d="M9 8.4l3 3.6 3-3.6M12 12v4M10 13.2h4M10 14.8h4"/>',
    listTennis: '<path d="M5 6.5h9M5 12h9M5 17.5h6"/><circle cx="17.5" cy="16.8" r="3"/><path d="M16 14.8c1.1 .6 2.7 .6 3.5 0 M15.6 17.6c1.1-.6 2.7-.6 3.5 0"/>',
    calEvent: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><path d="M8.5 13.5l2 2 4.5-5"/>',
    trend:    '<path d="M4 16.5l5-5 3.5 3 6.5-8"/><path d="M15 6.5h4v4"/><circle cx="9" cy="11.5" r="1.2" fill="currentColor" stroke="none"/>',
    userCap:  '<circle cx="12" cy="9" r="3.6"/><path d="M5 20c.5-3.5 3.4-5.5 7-5.5s6.5 2 7 5.5"/><path d="M3.5 14.5c1.6 1.2 4.4 1.2 6 0v2.2c-1.6 1.2-4.4 1.2-6 0z"/>',
    /* 可爱风底部 Tab 图标：圆润、带网球小点缀 */
    recCute:  '<rect x="5" y="4" width="14" height="16" rx="3.6"/><path d="M8.4 9l1.4 1.4 2.6-2.6"/><path d="M8.4 14l1.4 1.4 2.6-2.6"/><circle cx="16.4" cy="16.2" r="2.2"/><path d="M15 15c.7.4 1.8.4 2.4 0M14.8 17.2c.7-.4 1.8-.4 2.4 0"/>',
    calCute:  '<rect x="4.5" y="5.5" width="15" height="14.5" rx="3.6"/><path d="M8 3.4v3.2M16 3.4v3.2"/><circle cx="12" cy="13" r="3"/><path d="M9.8 12c1.2.6 3.2.6 4.4 0M9.6 14.2c1.2-.6 3.2-.6 4.4 0"/>',
    statCute: '<path d="M7 4.5h10v3.5a5 5 0 0 1-10 0V4.5z"/><path d="M7 6C5 6 4 7 4.6 9.2M17 6c2 0 3 1 2.4 3.2"/><path d="M12 13v3.2M9 20h6M9.6 16.4h4.8L15 20H9z"/>',
    meCute:   '<circle cx="12" cy="10" r="5"/><circle cx="10" cy="9.4" r=".75" fill="currentColor" stroke="none"/><circle cx="14" cy="9.4" r=".75" fill="currentColor" stroke="none"/><path d="M9.6 12c1.3 1.2 3.5 1.2 4.8 0"/><path d="M7 6.4C7 4.9 9.3 4 12 4s5 .9 5 2.4c0 .9-1.8 1.4-5 1.4s-5-.5-5-1.4z"/><path d="M7 6.4c1.8.9 6.2.9 8 0"/>',
    yuan:     '<circle cx="12" cy="12" r="8.5"/><path d="M9 8.4l3 3.6 3-3.6M12 12v4M10 13.2h4M10 14.8h4"/>',
    note:     '<path d="M4 5h16v11H9.5L5 20V5z"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    chart:    '<path d="M5 19V10M12 19V5M19 19v-7"/>',
    user:     '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.6-4 3.8-6 7.5-6s6.9 2 7.5 6"/>',
    edit:     '<path d="M4 20l4.2-.9L18.6 8.7a1.7 1.7 0 0 0-2.4-2.4L5.9 16.8 4 20z"/>',
    trash:    '<path d="M5 7h14M9 7V5h6v2M7.5 7l1 13h7l1-13"/>',
    download: '<path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14"/>',
    phone:    '<rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M10.8 18h2.4"/>',
    logout:   '<path d="M14 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    refresh:  '<path d="M5 12a7 7 0 0 1 12-5l2 2M19 12a7 7 0 0 1-12 5l-2-2"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    list:     '<path d="M5 5h14M5 12h14M5 19h14"/><circle cx="8.5" cy="5" r="0.6" fill="currentColor"/><circle cx="8.5" cy="12" r="0.6" fill="currentColor"/><circle cx="8.5" cy="19" r="0.6" fill="currentColor"/>',
    target:   '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    close:    '<path d="M6 6l12 12M18 6L6 18"/>',
    cloud:    '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17.5 18H7z"/>'
  };
  function svg(name, extra) {
    var p = ICONS[name] || ICONS.tennis;
    return '<svg class="ico' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + p + '</svg>';
  }
  /** 把页面中所有 [data-ico] 元素填充为对应 SVG（静态结构用） */
  function paintIcons(root) {
    (root || document).querySelectorAll('[data-ico]').forEach(function (el) {
      el.innerHTML = svg(el.getAttribute('data-ico'));
    });
  }

  /* ---------- 提示 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  /* ---------- 确认框（Promise） ---------- */
  function confirmBox(text, okText) {
    return new Promise(function (resolve) {
      var mask = $('#confirm-mask');
      $('#confirm-text').innerHTML = text;
      $('#confirm-yes').textContent = okText || '确定';
      mask.classList.remove('hidden');
      function done(v) {
        mask.classList.add('hidden');
        $('#confirm-yes').onclick = null;
        $('#confirm-no').onclick = null;
        mask.onclick = null;
        resolve(v);
      }
      $('#confirm-yes').onclick = function () { done(true); };
      $('#confirm-no').onclick = function () { done(false); };
      mask.onclick = function (e) { if (e.target === mask) done(false); };
    });
  }

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /** 'YYYY-MM-DD' → 本地 Date（避免 iOS 时区偏移） */
  function parseDate(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function ym(s) { return String(s || '').slice(0, 7); }

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function fmtDate(s) {
    var d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }
  function fmtDateFull(s) {
    var d = parseDate(s);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()];
  }

  /* ---------- 数值 ---------- */
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
  }
  function fmtDurShort(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + 'm';
    var h = min / 60;
    return (Math.round(h * 10) / 10) + 'h';
  }
  function money(n) {
    n = Number(n || 0);
    return (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /* ---------- 颜色 ---------- */
  function hex2rgb(hex) {
    hex = String(hex || '#cccccc').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return {
      r: parseInt(hex.slice(0, 2), 16) || 0,
      g: parseInt(hex.slice(2, 4), 16) || 0,
      b: parseInt(hex.slice(4, 6), 16) || 0
    };
  }
  function rgba(hex, a) {
    var c = hex2rgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  /** 根据背景色返回可读文字色 */
  function inkOn(hex) {
    var c = hex2rgb(hex);
    var l = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return l > 0.68 ? '#41514A' : '#FFFFFF';
  }

  /* ---------- 文本 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 常量 ---------- */
  var EFFORT_TEXT = ['', '轻松热身', '有点微汗', '正常强度', '有点累人', '力竭爆汗'];

  // 运动类型取色器预设：明亮舒服的浅绿 / 浅黄 / 浅粉 / 浅橙为主，外加几支柔和辅色
  var PRESET_COLORS = [
    '#7BD9A8', '#86D9BE', '#A8E6CF', // 浅绿系
    '#FFD98A', '#FFE3A8',             // 浅黄系
    '#FFB3C1', '#FFC9D6',             // 浅粉系
    '#FFC89B', '#FFD8B0',             // 浅橙系
    '#9FD8F0', '#B5C7F0', '#C3B1F0', '#F0A8C8' // 柔和辅色
  ];

  var DEFAULT_TYPES = [
    { name: '私教', color: '#7BD9A8', sort_order: 0 },
    { name: '练球', color: '#9FD8F0', sort_order: 1 },
    { name: '比赛', color: '#FFD98A', sort_order: 2 }
  ];

  /** 耗力小球（只读展示）：使用小型网球 SVG 图标 */
  function ballsHTML(n) {
    var h = '<span class="balls">';
    for (var i = 1; i <= 5; i++) {
      h += '<span class="b' + (i <= n ? ' on' : '') + '">' + svg('tennis', 'ball') + '</span>';
    }
    return h + '</span>';
  }

  return {
    $: $, $$: $$, svg: svg, paintIcons: paintIcons,
    toast: toast, confirmBox: confirmBox,
    pad: pad, todayStr: todayStr, dateStr: dateStr, parseDate: parseDate, ym: ym,
    fmtDate: fmtDate, fmtDateFull: fmtDateFull,
    fmtDur: fmtDur, fmtDurShort: fmtDurShort, money: money,
    rgba: rgba, inkOn: inkOn, esc: esc, ballsHTML: ballsHTML,
    EFFORT_TEXT: EFFORT_TEXT, PRESET_COLORS: PRESET_COLORS, DEFAULT_TYPES: DEFAULT_TYPES, WEEK: WEEK
  };
})();
