/* ===========================================================
 *  app.js  —  启动、登录、导航、全局状态
 * =========================================================== */
(function () {
  var $ = U.$, $$ = U.$$;

  /* 本地缓存：把已同步的数据存到 localStorage，刷新/断网时也能瞬时显示，不等云端 */
  var Cache = {
    loadTypes: function () {
      try { return JSON.parse(localStorage.getItem('tl_cache_types')) || []; } catch (e) { return []; }
    },
    loadRecords: function () {
      try { return JSON.parse(localStorage.getItem('tl_cache_records')) || []; } catch (e) { return []; }
    },
    /* 本地缓存只存已同步的记录，pending（未同步）的不进缓存，避免重复/误显 */
    save: function (types, records) {
      try {
        localStorage.setItem('tl_cache_types', JSON.stringify(types));
        localStorage.setItem('tl_cache_records', JSON.stringify((records || []).filter(function (r) { return !r._pending; })));
      } catch (e) { /* 配额满或隐私模式，忽略 */ }
    }
  };

  /* 给 Promise 加超时，避免手机连不上 supabase.co 时无限挂起（保存/同步都会用到） */
  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  U.paintIcons();   // 注入页面静态 SVG 图标

  var App = window.App = {
    state: {
      user: null,
      types: [],
      records: [],
      filterType: 'all',
      calCursor: new Date(),   // 月历当前月份
      page: 'records',
      loading: false,
      syncErr: false,
      syncTimeout: false,
      syncSeq: 0,        // 每次同步的序号，用于丢弃过期回调
      _settled: false    // 本次同步是否已结束
    },

    /* 云端同步状态文案（真实反映加载/完成/失败/超时，不再无限「同步中」） */
    syncLabel: function () {
      var st = App.state;
      if (st.loading) return U.svg('cloud') + ' 云端同步中…';
      if (st.syncErr) return (st.syncTimeout ? '同步超时，' : '同步失败，') + '点右上角刷新图标重试';
      return st.records.length + ' 条记录 · 已同步';
    },

    /* 右上角刷新按钮：只切旋转动画，绝不替换图标内容 */
    refreshIcon: function (spinning) {
      var b = $('#btn-refresh');
      if (!b) return;
      if (!b.querySelector('svg')) b.innerHTML = U.svg('refresh');  // 修复被文字覆盖的历史状态
      b.classList.toggle('spinning', !!spinning);
    },

    /* ---- 类型查找 ---- */
    typeById: function (id) {
      var t = null;
      App.state.types.some(function (x) { if (x.id === id) { t = x; return true; } });
      return t || { id: null, name: '未分类', color: '#C9C2CE' };
    },

    /* ---- 页面切换 ---- */
    go: function (page) {
      App.state.page = page;
      ['records', 'calendar', 'stats', 'settings'].forEach(function (p) {
        $('#page-' + p).classList.toggle('hidden', p !== page);
      });
      $$('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
      $('#fab').classList.toggle('hidden', page === 'settings' || page === 'stats');
      var titles = {
        records: ['tennisStack', '打球手记'],
        calendar: ['calEvent', '网球日程'],
        stats: ['chart', '战绩看板'],
        settings: ['userCap', '冲澳档案']
      };
      $('#topbar-emoji').innerHTML = U.svg(titles[page][0]);
      $('#topbar-text').textContent = titles[page][1];
      $('#main-scroll').scrollTop = 0;
      window.scrollTo(0, 0);
      App.renderPage(page);
    },

    renderPage: function (page) {
      if (page === 'records') Records.render();
      else if (page === 'calendar') Calendar.render();
      else if (page === 'stats') Stats.render();
      else if (page === 'settings') Settings.render();
    },

    renderAll: function () {
      Records.render();
      Calendar.render();
      Stats.render();
      Settings.render();
    },

    /* ---- 从云端拉取全部数据（先渲染本地缓存，云端同步后台进行，避免手机慢网络时一直空白） ---- */
    reloadAll: function (silent) {
      if (!App.state.user) return Promise.resolve();
      var seq = ++App.state.syncSeq;       // 本次同步序号，用于丢弃过期回调
      App.state._settled = false;
      App.state.loading = true;
      App.state.syncErr = false;
      App.state.syncTimeout = false;

      // 立即可见：先把上次缓存的数据渲染出来，云端同步在后台默默进行，不再干等空白
      App.state.types = Cache.loadTypes();
      App.state.records = Cache.loadRecords();
      App.renderAll();
      if (!silent) {
        if ($('#me-sub')) $('#me-sub').innerHTML = App.syncLabel();
        App.refreshIcon(true);
      }

      return new Promise(function (resolve) {
        /* 收尾：done=成功 / err=失败 / isTimeout=超时，三者互斥 */
        function settle(done, err, isTimeout) {
          if (seq !== App.state.syncSeq || App.state._settled) return;  // 已有更新的同步，丢弃本次结果
          App.state._settled = true;
          App.state.loading = false;
          App.state.syncErr = !!err;
          App.state.syncTimeout = !!isTimeout;
          App.refreshIcon(false);
          if (done) {
            // 把尚未同步的离线记录重新放回状态（本地已存，稍后重试），保证始终可见
            // 若云端已存在同内容的已同步记录，则跳过注入，避免并发时的瞬时重复
            App.Offline.all().forEach(function (op) {
              var sig = [op.payload.type_id, op.payload.played_on, op.payload.duration_min, op.payload.effort, op.payload.cost, op.payload.note].join('§');
              var exists = App.state.records.some(function (r) {
                return r.id === op.localId ||
                  (r._pending === false && [r.type_id, r.played_on, r.duration_min, r.effort, r.cost, r.note].join('§') === sig);
              });
              if (!exists) {
                var rec = { id: op.localId, _pending: true, user_id: op.uid, created_at: new Date().toISOString() };
                Object.keys(op.payload).forEach(function (k) { rec[k] = op.payload[k]; });
                App.state.records.push(rec);
              }
            });
            App.state.records.sort(function (a, b) {
              if (a.played_on === b.played_on) return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
              return a.played_on < b.played_on ? 1 : -1;
            });
            Cache.save(App.state.types, App.state.records);  // 同步成功，刷新本地缓存（只存已同步的）
            App.renderAll();
            App.flushPending();   // 立即重试离线记录
          }
          if ($('#me-sub')) $('#me-sub').innerHTML = App.syncLabel();
          if (err && !isTimeout) { U.toast(API.msg(err)); console.error(err); }
          if (isTimeout) U.toast('云端同步超时，点右上角刷新图标重试');
          resolve();
        }

        Promise.all([API.listTypes(), API.listRecords()]).then(function (res) {
          var tRes = res[0], rRes = res[1];
          if (tRes.error) throw tRes.error;
          if (rRes.error) throw rRes.error;

          App.state.types = tRes.data || [];
          App.state.records = rRes.data || [];

          // 新账号：写入默认 3 种类型
          if (App.state.types.length === 0) {
            return API.seedTypes(App.state.user.id).then(function (r) {
              if (!r.error) App.state.types = r.data || [];
            });
          }
        }).then(function () { settle(true); }).catch(function (err) { settle(false, err); });

        // 超时保护：最多等 30 秒（手机访问 supabase.co 经常慢），超时后转成明确的「同步超时」，不再无限转圈
        setTimeout(function () { settle(false, null, true); }, 30000);
      });
    },

    /* ---- 离线保存队列：保存先写本地，后台同步云端；连不上则保留，网络恢复/下次打开自动重试 ---- */
    Offline: {
      KEY: 'tl_pending',
      _rd: function () { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
      _wr: function (l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {} },
      enqueue: function (op) { var l = this._rd(); l.push(op); this._wr(l); },
      remove: function (localId) { this._wr(this._rd().filter(function (o) { return o.localId !== localId; })); },
      all: function () { return this._rd(); }
    },

    /* 把未同步的离线记录逐个尝试同步云端；成功后用真实记录替换本地临时记录，失败则保留稍后重试 */
    flushPending: function () {
      if (!App.state.user) return;
      // 只取未在途的记录，避免同一记录被并发同步两次（重复上传）
      var ops = App.Offline.all().filter(function (o) { return !o._inflight; });
      if (!ops.length) return;
      var total = ops.length, done = 0, okN = 0, failN = 0;
      function finish() {
        if (okN && !failN) U.toast('已同步到云端 ☁️');
        else if (failN) U.toast('云端暂时连不上，记录已存手机本地，稍后自动重试');
      }
      ops.forEach(function (op) {
        // 标记在途，防止并发重复同步
        var all = App.Offline.all();
        var t = all.find(function (o) { return o.localId === op.localId; });
        if (t) { t._inflight = true; App.Offline._wr(all); }

        var p = op.op === 'update'
          ? API.updateRecord(op.realId, op.payload)
          : API.createRecord(op.uid, op.payload);
        withTimeout(p, 20000).then(function (res) {
          if (res.error) throw res.error;
          var row = res.data;                       // 云端返回的真实记录（带真实 id）
          App.state.records = App.state.records.map(function (r) {
            if (r.id === op.localId) { row._pending = false; return row; }
            return r;
          });
          App.Offline.remove(op.localId);           // 同步成功：出队（顺带清掉 _inflight）
          App.renderAll();
          Cache.save(App.state.types, App.state.records);
          done++; okN++; if (done === total) finish();
        }).catch(function (err) {
          console.warn('离线记录同步失败（保留，稍后自动重试）', op.localId, err);
          // 清除在途标记，允许下次（网络恢复 / 打开 App / 点刷新）重试
          var a2 = App.Offline.all();
          var t2 = a2.find(function (o) { return o.localId === op.localId; });
          if (t2) { delete t2._inflight; App.Offline._wr(a2); }
          done++; failN++; if (done === total) finish();
        });
      });
    }
  };

  /* =========================================================
   *  视图切换
   * ========================================================= */
  function show(view) {
    ['#view-setup', '#view-auth', '#view-main'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== view);
    });
    $('#boot').classList.add('hidden');
  }

  /* =========================================================
   *  配置引导
   * ========================================================= */
  $('#setup-save').addEventListener('click', function () {
    var url = $('#setup-url').value.trim();
    var key = $('#setup-key').value.trim();
    if (!/^https?:\/\/.+/.test(url)) return U.toast('请填写正确的 Project URL');
    if (key.length < 20) return U.toast('API key 看起来不完整');
    Config.save(url, key);
    location.reload();
  });

  /* 入口：从登录页也能打开连接设置（预填当前值，便于改项目/换 key） */
  function openSetup() {
    var c = Config.get();
    $('#setup-url').value = c.url || '';
    $('#setup-key').value = c.key || '';
    show('#view-setup');
  }
  if ($('#auth-config')) $('#auth-config').addEventListener('click', openSetup);

  /* =========================================================
   *  登录 / 注册
   * ========================================================= */
  var authMode = 'login';

  $$('#auth-seg .seg-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      authMode = btn.dataset.mode;
      $$('#auth-seg .seg-item').forEach(function (b) { b.classList.toggle('active', b === btn); });
      $('#auth-submit').textContent = authMode === 'login' ? '登录' : '注册并开始';
      $('#auth-pass').setAttribute('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
      setAuthMsg('');
    });
  });

  function setAuthMsg(text, ok) {
    var el = $('#auth-msg');
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
  }

  $('#auth-submit').addEventListener('click', function () {
    var name = $('#auth-name').value.trim();
    var pass = $('#auth-pass').value;
    if (!name) return setAuthMsg('请填写用户名');
    if (!pass || pass.length < 6) return setAuthMsg('密码至少 6 位');

    var btn = this;
    btn.disabled = true;
    btn.textContent = authMode === 'login' ? '登录中…' : '注册中…';
    setAuthMsg('');

    var p = authMode === 'login' ? API.signIn(name, pass) : API.signUp(name, pass);

    p.then(function (res) {
      if (res.error) throw res.error;
      if (authMode === 'signup' && !res.data.session) {
        setAuthMsg('注册已提交！由于使用昵称登录，请到 Supabase 后台 Authentication → Providers → Email 关闭「Confirm email」后重新注册，即可直接登录', true);
        return;
      }
      // 登录成功由 onAuthStateChange 统一处理
    }).catch(function (err) {
      setAuthMsg(API.msg(err));
    }).then(function () {
      btn.disabled = false;
      btn.textContent = authMode === 'login' ? '登录' : '注册并开始';
    });
  });

  $('#auth-pass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#auth-submit').click();
  });

  /* =========================================================
   *  进入 / 退出
   * ========================================================= */
  var entered = false;

  function enterApp(user) {
    App.state.user = user;
    $('#me-email').textContent = API.displayName(user);
    show('#view-main');
    if (!entered) { entered = true; App.go('records'); }
    App.reloadAll();
  }

  function leaveApp() {
    entered = false;
    App.state.user = null;
    App.state.types = [];
    App.state.records = [];
    $('#auth-pass').value = '';
    show('#view-auth');
  }

  /* =========================================================
   *  底部导航 / 顶栏 / FAB
   * ========================================================= */
  $$('.tab').forEach(function (b) {
    b.addEventListener('click', function () { App.go(b.dataset.page); });
  });
  $('#btn-refresh').addEventListener('click', function () {
    App.reloadAll().then(function () {
      if (!App.state.syncErr) U.toast('已同步云端最新数据');
    });
  });
  $('#fab').addEventListener('click', function () { Records.openSheet(null, null); });

  /* =========================================================
   *  启动
   * ========================================================= */
  function boot() {
    if (!Config.isReady()) { show('#view-setup'); return; }

    if (!API.init()) { show('#view-setup'); return; }

    API.onAuth(function (event, session) {
      if (session && session.user) {
        if (!App.state.user || App.state.user.id !== session.user.id) enterApp(session.user);
      } else if (event === 'SIGNED_OUT') {
        leaveApp();
      }
    });

    API.getSession().then(function (res) {
      var s = res && res.data ? res.data.session : null;
      if (s && s.user) enterApp(s.user);
      else show('#view-auth');
    }).catch(function (err) {
      console.error(err);
      show('#view-auth');
      setAuthMsg(API.msg(err));
    });
  }

  boot();

  /* 轻量点击弹跳动效（卡片 / 分类标签 / Tab / FAB），只用 transform，不影响布局、不卡顿 */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('.tap-on');
    if (el) {
      el.classList.remove('tap');
      void el.offsetWidth;          // 强制重排以重启动画
      el.classList.add('tap');
      setTimeout(function () { el.classList.remove('tap'); }, 320);
    }
  });

  /* =========================================================
   *  Service Worker（PWA）— 新版本自动检测更新
   * ========================================================= */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.update();   // 每次打开都去服务端检查新版本
      }).catch(function (e) { console.warn('SW 注册失败', e); });
    });
    // 当新版本接管时自动刷新，确保用户拿到最新代码（不会卡在旧缓存）
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  /* 安装提示（Android / Chrome） */
  window.__deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__deferredPrompt = e;
  });

  /* 网络恢复时，自动把离线保存的记录重试同步到云端 */
  window.addEventListener('online', function () { App.flushPending(); });
})();
