/* ===========================================================
 *  app.js  —  启动、登录、导航、全局状态
 * =========================================================== */
(function () {
  var $ = U.$, $$ = U.$$;

  /* ============================================================
   *  本地优先存储层（唯一真相来源）
   *  所有业务数据都先写这里，云端只是「可选镜像」。
   *  刷新 / 断网 / 云端挂了，界面永远从本地渲染，记录永不消失、永不复重。
   * ============================================================ */
  var Store = {
    KEY_RECORDS: 'tl_records',
    KEY_TYPES: 'tl_types',
    loadTypes: function () {
      try { return JSON.parse(localStorage.getItem(this.KEY_TYPES)) || []; } catch (e) { return []; }
    },
    loadRecords: function () {
      try { return JSON.parse(localStorage.getItem(this.KEY_RECORDS)) || []; } catch (e) { return []; }
    },
    saveTypes: function (ts) { try { localStorage.setItem(this.KEY_TYPES, JSON.stringify(ts)); } catch (e) {} },
    saveRecords: function (rs) { try { localStorage.setItem(this.KEY_RECORDS, JSON.stringify(rs)); } catch (e) {} },
    putType: function (t) {
      var ts = this.loadTypes();
      var i = ts.findIndex(function (x) { return x.client_uuid === t.client_uuid; });
      if (i >= 0) ts[i] = t; else ts.push(t);
      this.saveTypes(ts);
      return t;
    },
    putRecord: function (r) {
      var rs = this.loadRecords();
      var i = rs.findIndex(function (x) { return x.client_uuid === r.client_uuid; });
      if (i >= 0) rs[i] = r; else rs.push(r);
      this.saveRecords(rs);
      return r;
    },
    removeType: function (cuuid) {
      this.saveTypes(this.loadTypes().filter(function (x) { return x.client_uuid !== cuuid; }));
    },
    removeRecord: function (cuuid) {
      this.saveRecords(this.loadRecords().filter(function (x) { return x.client_uuid !== cuuid; }));
    }
  };
  window.AppStore = Store;

  /* 把旧版本（tl_cache_* + tl_pending）平滑迁移到新的本地优先模型。
   * 关键：旧云端记录/类型的 cloud id 直接复用为 client_uuid，这样只要云端执行过
   * 「client_uuid = id」回填，幂等 upsert 就能精准命中旧行、绝不产生重复。 */
  function migrate() {
    if (localStorage.getItem('tl_migrated_v2') === '1') return;
    var oldTypes = []; try { oldTypes = JSON.parse(localStorage.getItem('tl_cache_types')) || []; } catch (e) {}
    var oldRecs = [];  try { oldRecs  = JSON.parse(localStorage.getItem('tl_cache_records')) || []; } catch (e) {}
    var pending = [];  try { pending  = JSON.parse(localStorage.getItem('tl_pending')) || []; } catch (e) {}

    // 类型：复用 cloud id 作为 client_uuid
    var typeMap = {};   // 旧 cloud id -> client_uuid
    var newTypes = oldTypes.map(function (t) {
      var cuuid = t.id ? String(t.id) : U.uuid();
      typeMap[t.id ? String(t.id) : '__none__'] = cuuid;
      return {
        id: t.id || null, client_uuid: cuuid, name: t.name, color: t.color,
        sort_order: t.sort_order || 0, dirty: false, synced: true, deleted: false,
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || t.created_at || new Date().toISOString()
      };
    });

    function toRec(r, cuuid, isPending) {
      var typeCuuid = typeMap[(r.type_id != null) ? String(r.type_id) : '__none__'] || '';
      return {
        client_uuid: cuuid,
        type_id: typeCuuid,                 // 类型引用改为「类型的 client_uuid」
        played_on: r.played_on, duration_min: r.duration_min, effort: r.effort,
        cost: r.cost, note: r.note || '',
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || new Date().toISOString(),
        dirty: !!isPending, synced: !isPending, deleted: false
      };
    }

    var newRecs = [];
    oldRecs.forEach(function (r) {
      newRecs.push(toRec(r, r.id ? String(r.id) : U.uuid(), false));  // 云端来的：已同步
    });
    pending.forEach(function (op) {
      newRecs.push(toRec(op.payload || {}, U.uuid(), true));            // 从未上云的：待同步
    });

    Store.saveTypes(newTypes);
    Store.saveRecords(newRecs);
    try {
      localStorage.setItem('tl_migrated_v2', '1');
      localStorage.removeItem('tl_cache_types');
      localStorage.removeItem('tl_cache_records');
      localStorage.removeItem('tl_pending');
    } catch (e) {}
  }

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
      cloudEnabled: false,   // 是否已登录云端（云端为可选镜像；本地始终可用）
      types: [],
      records: [],
      filterType: 'all',
      calCursor: new Date(),   // 月历当前月份
      page: 'records',
      loading: false,
      syncErr: false,
      syncTimeout: false,
      flushErr: false,   // 后台把本地记录推云端时是否有失败（用于横幅提示）
      flushing: false,   // 后台正在把本地记录推云端（用于同步状态文案，避免误显示「已同步」）
      syncSeq: 0,        // 每次同步的序号，用于丢弃过期回调
      _settled: false,   // 本次同步是否已结束
      explicitSignOut: false,  // 仅“显式退出”才回登录页，后台刷新失败不要误踢
      lastFlush: null,   // 上次「上传本地记录到云端」的结果（用于自查面板）
      lastSync: null     // 上次「从云端下载」的结果（用于自查面板）
    },

    /* 云端同步状态文案（本地优先：先说清楚「本地 N 条」，再补充云端情况） */
    syncLabel: function () {
      var st = App.state;
      var n = (st.records || []).filter(function (r) { return !r.deleted; }).length;
      if (!st.cloudEnabled) return '本地 ' + n + ' 条 · 未连接云端';
      var pending = App.pendingCount();
      if (st.loading || st.flushing) return U.svg('cloud') + ' 云端同步中…';
      if (pending > 0) return '本地 ' + n + ' 条 · ' + pending + ' 条待同步云端';
      if (st.syncErr) return (st.syncTimeout ? '同步超时，' : '同步失败，') + '点右上角刷新图标重试';
      return '本地 ' + n + ' 条 · 已同步云端';
    },

    /* 刷新冲澳档案同步状态行，并联动「查看未上传」按钮显隐（仅有待同步记录时显示） */
    refreshSyncBadge: function () {
      var sub = $('#me-sub');
      if (sub) sub.innerHTML = App.syncLabel();
      var btn = $('#btn-sync-detail');
      if (btn) btn.classList.toggle('hidden', App.pendingCount() === 0);
    },

    /* 右上角刷新按钮：只切旋转动画，绝不替换图标内容 */
    refreshIcon: function (spinning) {
      var b = $('#btn-refresh');
      if (!b) return;
      if (!b.querySelector('svg')) b.innerHTML = U.svg('refresh');  // 修复被文字覆盖的历史状态
      b.classList.toggle('spinning', !!spinning);
    },

    /* ---- 类型查找（按 client_uuid，本地优先引用方式） ---- */
    typeById: function (id) {
      var t = null;
      App.state.types.some(function (x) { if (x.client_uuid === id) { t = x; return true; } });
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

    /* 记录页顶部「同步状态」横幅：本地优先，如实显示「待同步」数量与失败原因。 */
    updateSyncBanner: function () {
      var b = $('#sync-banner');
      if (!b) return;
      var st = App.state;
      var n = App.pendingCount();
      if (!st.cloudEnabled || !n) { b.className = 'sync-banner hidden'; b.innerHTML = ''; return; }
      var lf = st.lastFlush || {};
      var cls, txt;
      if (st.flushing) { cls = 'info'; txt = '正在上传 ' + n + ' 条到云端…'; }
      else if (st.syncErr || st.flushErr) {
        cls = 'warn';
        var why = (lf && lf.err) ? ('（' + App.shortErr(lf.err) + '）') : '（网络或云端异常）';
        txt = '云端连不上，' + n + ' 条已安全存手机本地，稍后自动重试 ' + why;
      } else { cls = 'info'; txt = n + ' 条已存手机本地，待同步到云端'; }
      b.className = 'sync-banner ' + cls;
      b.innerHTML =
        '<span class="sb-ico">' + U.svg('cloud') + '</span>' +
        '<span class="sb-txt">' + txt + '</span>' +
        '<button class="sb-btn" id="sb-retry">立即同步</button>' +
        '<button class="sb-btn sb-dbg" id="sb-dbg">自查</button>';
      var btn = $('#sb-retry');
      if (btn) btn.addEventListener('click', function () { App.maybeSync(true); U.toast('正在尝试同步…'); });
      var dbg = $('#sb-dbg');
      if (dbg) dbg.addEventListener('click', function () { App.openDiag(); });
    },

    /* 把错误信息截断，便于在横幅里显示 */
    shortErr: function (s) {
      s = String(s || '');
      if (s.length > 40) s = s.slice(0, 40) + '…';
      return s;
    },

    /* 同步自查面板：让用户（和我们）看清「待同步记录 / 上次上传错误 / 上次下载错误」，便于对症 */
    openDiag: function () {
      var mask = $('#diag-mask');
      if (!mask) return;
      var pending = App.state.records.filter(function (r) { return r.dirty && !r.deleted; });
      var lf = App.state.lastFlush || {};
      var ls = App.state.lastSync || {};
      var html = '';
      html += '<div class="diag-sec"><b>待同步到云端（' + pending.length + ' 条）</b>';
      if (!pending.length) html += '<div class="diag-row ok">无，已全部同步到云端</div>';
      else pending.slice(0, 30).forEach(function (r) {
        html += '<div class="diag-row">' + U.esc(U.fmtDate(r.played_on)) + ' · ' +
          U.esc(App.typeById(r.type_id).name) + ' · ' + U.fmtDur(r.duration_min) + '</div>';
      });
      html += '</div>';
      html += '<div class="diag-sec"><b>上次上传</b><div class="diag-row">' +
        (lf.ts ? (new Date(lf.ts).toLocaleString('zh-CN') + ' · 成功 ' + lf.ok + ' / 失败 ' + lf.fail) : '尚未尝试') +
        (lf.err ? '<br><span class="diag-err">错误：' + U.esc(lf.err) + '</span>' : '') + '</div></div>';
      html += '<div class="diag-sec"><b>上次下载</b><div class="diag-row">' +
        (ls.ts ? (new Date(ls.ts).toLocaleString('zh-CN') + ' · ' + (ls.ok ? '成功' : '失败') + (ls.err ? ('<br><span class="diag-err">错误：' + U.esc(ls.err) + '</span>') : '')) : '尚未尝试') + '</div></div>';
      if (lf.err && /does not exist/i.test(lf.err)) {
        html += '<div class="diag-sec diag-tip" style="border-color:#e8a33d;color:#9a5b00;background:#fff7ea">'
          + '⚠️ 云端数据库表缺少新架构必需的列。请用电脑登录 Supabase 控制台 → SQL Editor，'
          + '把本项目 supabase/schema.sql 的第 6 段「升级迁移」整段粘贴执行（仅几行：加列 + 回填 client_uuid），'
          + '执行完回到这里点「立即同步」即可。本地数据不受影响。</div>';
      } else {
        html += '<div class="diag-sec diag-tip">本地数据永远安全，不会因云端连不上而丢失。若「待同步」一直不为 0：多为手机连 supabase.co 较慢，或云端写入权限(Row Level Security)拦截。点「立即同步」可手动重试；多次失败请把「错误」文字发我。</div>';
      }
      $('#diag-body').innerHTML = html;
      mask.classList.remove('hidden');
      $('#diag-close').onclick = function () { mask.classList.add('hidden'); };
      mask.onclick = function (e) { if (e.target === mask) mask.classList.add('hidden'); };
      var rb = $('#diag-retry');
      if (rb) rb.onclick = function () { mask.classList.add('hidden'); App.maybeSync(true); U.toast('正在尝试同步…'); };
    },

    /* ---- 花费隐私开关：统一一个开关，控制 App 内所有花费数字显隐 ---- */
    costHidden: (function () { try { return localStorage.getItem('tl_cost_hidden') === '1'; } catch (e) { return false; } })(),
    costView: function (v) {
      return App.costHidden ? '¥ ••••' : ('¥' + U.money(v));
    },
    toggleCostHidden: function () {
      App.costHidden = !App.costHidden;
      try { localStorage.setItem('tl_cost_hidden', App.costHidden ? '1' : '0'); } catch (e) {}
      App.renderAll();
    },

    /* ---- 本地优先加载：本地存储是唯一真相，先渲染本地（瞬时、永不丢），再后台同步云端 ---- */
    reloadAll: function (silent) {
      if (!App.state.user) return Promise.resolve();
      App.loadLocal();                 // 关键：先读本地，界面立刻有数据，刷新/断网都不丢
      App.renderAll();
      if (!silent) {
        if ($('#me-sub')) App.refreshSyncBadge();
      }
      return App.syncCloud();          // 后台与云端双向同步（拉取绝不删本地）
    },

    /* ---- 待同步数量（用于横幅与自查面板）：本地有改动且未删除的记录/类型 ---- */
    pendingCount: function () {
      var rs = (App.state.records || []).filter(function (r) { return r.dirty && !r.deleted; }).length;
      var ts = (App.state.types || []).filter(function (t) { return t.dirty && !t.deleted; }).length;
      return rs + ts;
    },

    /* ---- 从本地存储读取全部数据（唯一真相来源） ---- */
    loadLocal: function () {
      App.state.types = Store.loadTypes();
      App.state.records = Store.loadRecords();
      // 新用户（本地没有任何类型）：补 3 个默认类型，标记为待同步
      if (!App.state.types.length) {
        App.state.types = U.DEFAULT_TYPES.map(function (t, i) {
          return {
            id: null, client_uuid: U.uuid(), name: t.name, color: t.color,
            sort_order: i, dirty: true, synced: false, deleted: false,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
          };
        });
        Store.saveTypes(App.state.types);
      }
      App.sortRecords();
    },

    sortRecords: function () {
      App.state.records.sort(function (a, b) {
        if (a.played_on === b.played_on) return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
        return a.played_on < b.played_on ? 1 : -1;
      });
    },

    /* ---- 触发后台同步（拉取 + 推送）。云端只是镜像，失败时数据仍在本地，不影响使用 ---- */
    syncCloud: function () {
      if (!App.state.user) return Promise.resolve();
      if (navigator.onLine === false) return Promise.resolve();
      App.state.loading = true;
      App.state.syncErr = false;
      App.state.syncTimeout = false;
      if ($('#me-sub')) App.refreshSyncBadge();
      App.refreshIcon(true);
      return App.syncCloudPull()
        .then(function () { return App.syncCloudPush(); })
        .then(function () {
          App.state.loading = false;
          App.state.lastSync = { ok: true, err: '', ts: Date.now() };
          App.refreshIcon(false);
          App.renderAll();
          if ($('#me-sub')) App.refreshSyncBadge();
          App.updateSyncBanner();
        })
        .catch(function (err) {
          App.state.loading = false;
          App.state.syncErr = true;
          App.state.lastSync = { ok: false, err: (err && err.message) || '', ts: Date.now() };
          App.refreshIcon(false);
          // 拉取失败也要尝试把本地改动推上去，并刷新横幅（失败如实提示）
          App.syncCloudPush().then(function () {
            App.renderAll();
            if ($('#me-sub')) App.refreshSyncBadge();
            App.updateSyncBanner();
          });
          if (err && err.message) { U.toast(API.msg(err)); console.error(err); }
        });
    },

    /* ---- 从云端拉取：只「补充/更新」本地，绝不删除本地记录（根治「刷新后记录消失」） ---- */
    syncCloudPull: function () {
      if (!App.state.user) return Promise.resolve();
      return withTimeout(Promise.all([API.listTypes(), API.listRecords()]), 30000).then(function (res) {
        var tRes = res[0], rRes = res[1];
        if (tRes.error) throw tRes.error;
        if (rRes.error) throw rRes.error;

        // 跳过没有 client_uuid 的旧行（迁移前遗留的孤儿），避免本地出现重复
        var cTypes = (tRes.data || []).filter(function (t) { return t.client_uuid; });
        var cRecs  = (rRes.data || []).filter(function (r) { return r.client_uuid; });

        // 合并类型：云端有、本地没有 → 新增；云端有、本地干净 → 以云端为准；本地有改动 → 本地优先
        var localTypes = Store.loadTypes();
        cTypes.forEach(function (ct) {
          var i = localTypes.findIndex(function (t) { return t.client_uuid === ct.client_uuid; });
          var fresh = { id: ct.id, client_uuid: ct.client_uuid, name: ct.name, color: ct.color,
            sort_order: ct.sort_order || 0, dirty: false, synced: true, deleted: false,
            created_at: ct.created_at, updated_at: ct.updated_at };
          if (i < 0) localTypes.push(fresh);
          else if (!localTypes[i].dirty) localTypes[i] = fresh;        // 本地干净 → 跟随云端
          else if (!localTypes[i].id) localTypes[i].id = ct.id;        // 本地改动但缺云端 id → 补上
        });
        Store.saveTypes(localTypes);

        // 合并记录：同理，云端绝不作为「删除」依据
        var localRecs = Store.loadRecords();
        cRecs.forEach(function (cr) {
          var i = localRecs.findIndex(function (r) { return r.client_uuid === cr.client_uuid; });
          var fresh = {
            client_uuid: cr.client_uuid,
            // 新记录用 type_cuuid；旧记录（迁移前）无该列，回退到 type_id（其值正好等于迁移后类型的 client_uuid）
            type_id: cr.type_cuuid || (cr.type_id ? String(cr.type_id) : ''),
            played_on: cr.played_on, duration_min: cr.duration_min, effort: cr.effort,
            cost: cr.cost, note: cr.note || '',
            created_at: cr.created_at, updated_at: cr.updated_at,
            dirty: false, synced: true, deleted: false
          };
          if (i < 0) localRecs.push(fresh);
          else if (!localRecs[i].dirty) localRecs[i] = fresh;          // 本地干净 → 跟随云端
        });
        // 清理：已删除且已同步的本地记录（云端也已删），直接从本地移除
        localRecs = localRecs.filter(function (r) { return !(r.deleted && r.synced); });
        Store.saveRecords(localRecs);

        App.state.types = localTypes;
        App.state.records = localRecs;
        App.sortRecords();
        return { types: cTypes.length, records: cRecs.length };
      });
    },

    /* ---- 把本地待同步的改动推到云端，按 client_uuid 幂等写入（根治「重复记录」） ---- */
    syncCloudPush: function (silent) {
      if (!App.state.user) return Promise.resolve();
      if (navigator.onLine === false) return Promise.resolve();   // 明显离线，跳过，避免无谓重试
      var dirtyTypes = Store.loadTypes().filter(function (t) { return t.dirty; });
      var dirtyRecs  = Store.loadRecords().filter(function (r) { return r.dirty; });
      if (!dirtyTypes.length && !dirtyRecs.length) {
        App.state.flushing = false; App.state.flushErr = false;
        return Promise.resolve();
      }
      App.state.flushing = true;
      App.updateSyncBanner();
      var uid = App.state.user.id;
      var errMsg = '';
      var okTypeId = {}, okRecId = {};        // 成功同步的 client_uuid → 云端 id
      var delTypes = [], delRecs = [];        // 成功删除的 client_uuid

      var jobs = [];
      dirtyTypes.forEach(function (t) {
        var p = t.deleted
          ? API.deleteTypeByUuid({ cuuid: t.client_uuid, id: t.id })
          : API.upsertType(uid, t);
        jobs.push(withTimeout(p, 40000).then(function (res) {
          if (res.error) throw res.error;
          if (t.deleted) delTypes.push(t.client_uuid);
          else { if (res.data && res.data.id) okTypeId[t.client_uuid] = res.data.id; }
        }).catch(function (err) { if (!errMsg) errMsg = (err && err.message) || String(err); throw err; }));
      });

      dirtyRecs.forEach(function (r) {
        var p = r.deleted
          ? API.deleteRecordByUuid({ cuuid: r.client_uuid, id: r.id })
          : API.upsertRecord(uid, { id: r.id, client_uuid: r.client_uuid,
              type_cuuid: r.type_id || null, _typeId: App.typeById(r.type_id).id,
              played_on: r.played_on, duration_min: r.duration_min, effort: r.effort,
              cost: r.cost, note: r.note || null });
        jobs.push(withTimeout(p, 40000).then(function (res) {
          if (res.error) throw res.error;
          if (r.deleted) delRecs.push(r.client_uuid);
          else { if (res.data && res.data.id) okRecId[r.client_uuid] = res.data.id; }
        }).catch(function (err) { if (!errMsg) errMsg = (err && err.message) || String(err); throw err; }));
      });

      var okN = 0, failN = 0;
      return Promise.all(jobs.map(function (j) {
        return j.then(function () { okN++; }).catch(function () { failN++; });
      })).then(function () {
        // 全部网络请求落定后，统一对本地存储做一次原子更新，避免并发读写互相覆盖
        // 导致部分记录 dirty 标记残留、冲澳档案一直显示「待同步云端」
        if (delTypes.length || Object.keys(okTypeId).length) {
          var tl = Store.loadTypes();
          tl.forEach(function (t) {
            if (okTypeId[t.client_uuid] !== undefined) { t.id = okTypeId[t.client_uuid]; t.dirty = false; t.synced = true; }
          });
          tl = tl.filter(function (t) { return delTypes.indexOf(t.client_uuid) < 0; });
          Store.saveTypes(tl);
          App.state.types = tl;
        }
        if (delRecs.length || Object.keys(okRecId).length) {
          var rl = Store.loadRecords();
          rl.forEach(function (r) {
            if (okRecId[r.client_uuid] !== undefined) { r.id = okRecId[r.client_uuid]; r.dirty = false; r.synced = true; }
          });
          rl = rl.filter(function (r) { return delRecs.indexOf(r.client_uuid) < 0; });
          Store.saveRecords(rl);
          App.state.records = rl;
        }
        App.state.flushing = false;
        App.state.flushErr = !!failN;
        App.state.lastFlush = { ok: okN, fail: failN, err: errMsg, ts: Date.now() };
        if (okN && !failN) { if (!silent) U.toast('已同步到云端'); }
        else if (failN) { if (!silent) U.toast('云端暂时连不上，已存手机本地，稍后自动重试'); }
        App.updateSyncBanner();
        App.renderAll();
        if ($('#me-sub')) App.refreshSyncBadge();
      });
    },

    /* ---- 用户操作（保存/删除）后调用：本地已落盘，这里静默尝试推云端 ---- */
    maybeSync: function (silent) {
      if (!App.state.cloudEnabled) return;
      App.syncCloudPush(silent);
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
    App.state.cloudEnabled = true;     // 已登录云端：云端作为可选镜像启用
    $('#me-email').textContent = API.displayName(user);
    show('#view-main');
    if (!entered) { entered = true; App.go('records'); }
    App.reloadAll();
  }

  function leaveApp() {
    entered = false;
    App.state.user = null;
    App.state.cloudEnabled = false;
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
  var bootStarted = false;

  function boot() {
    if (bootStarted) { attemptSession(); return; }
    bootStarted = true;

    migrate();   // 把旧版本本地数据平滑迁移到本地优先模型（仅首次）

    if (!Config.isReady()) { show('#view-setup'); return; }
    if (!API.init()) { show('#view-setup'); return; }

    /* 登录态变化统一处理（只注册一次，避免重试时重复绑定） */
    API.onAuth(function (event, session) {
      if (session && session.user) {
        if (!App.state.user || App.state.user.id !== session.user.id) enterApp(session.user);
      } else if (event === 'SIGNED_OUT') {
        // 仅“显式退出”才回登录页；后台刷新失败不要误踢（否则缓存模式进不来）
        if (App.state.explicitSignOut) leaveApp();
      }
    });

    // 已有本地登录票据 → 秒开（先渲染本地数据），联网校验放到后台，避免卡在启动屏
    var cached = API.peekSession();
    if (cached && cached.user) {
      try { API.setSession(cached.session); } catch (e) {}
      enterApp(cached.user);
      API.getSession().catch(function () {});   // 后台静默校验/刷新，失败也不影响已进入
      return;
    }

    attemptSession();
  }

  /* 拉取本地登录票据；网络慢/被拦时给超时兜底，避免永久卡在“准备球场” */
  function attemptSession() {
    var b = $('#boot');
    b.classList.remove('hidden');
    b.innerHTML = '<div class="boot-ball"></div><p>正在准备球场…</p>';

    var settled = false;
    var bootTimer = setTimeout(function () {
      if (settled) return;
      showBootRetry();
    }, 8000);   // 8 秒连不上就给出重试入口

    API.getSession().then(function (res) {
      if (settled) return; settled = true; clearTimeout(bootTimer);
      var s = res && res.data ? res.data.session : null;
      if (s && s.user) enterApp(s.user);
      else show('#view-auth');
    }).catch(function (err) {
      if (settled) return; settled = true; clearTimeout(bootTimer);
      console.error(err);
      show('#view-auth');
      setAuthMsg(API.msg(err));
    });
  }

  /* 连接超时的友好兜底：保留启动屏，提供“重试连接” */
  function showBootRetry() {
    var b = $('#boot');
    b.classList.remove('hidden');
    b.innerHTML =
      '<div class="boot-ball"></div>' +
      '<p>连接登录服务较慢…</p>' +
      '<p style="font-size:13px;opacity:.7;margin-top:6px">可能是网络波动，点下面按钮重试</p>' +
      '<button id="boot-retry" class="btn btn-primary btn-block" style="max-width:200px;margin:14px auto 0">重试连接</button>';
    var btn = $('#boot-retry');
    if (btn) btn.addEventListener('click', function () { attemptSession(); });
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

  /* 网络恢复时，自动把本地改动重试同步到云端 */
  window.addEventListener('online', function () { App.maybeSync(true); });

  /* 后台每 25 秒自动重试一次未同步改动（静默，不弹 toast），手机网络慢也能最终传上去 */
  setInterval(function () { if (navigator.onLine !== false) App.maybeSync(true); }, 25000);
})();
