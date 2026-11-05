/* ===========================================================
 *  page-settings.js  —  运动类型管理 / CSV 导出 / 安装 / 退出
 * =========================================================== */
window.Settings = (function () {
  var $ = U.$, $$ = U.$$;
  var editingType = null;

  /* 头像：有图显示图片，否则显示默认人形图标（数据存云端 user_metadata，跨设备一致） */
  function renderAvatar() {
    var el = $('#me-avatar');
    if (!el) return;
    var u = App.state.user;
    var av = u && u.user_metadata && u.user_metadata.avatar;
    el.innerHTML = av ? '<img src="' + av + '" alt="头像" />' : U.svg('user');
  }

  /* ---------------------------------------------------------
   *  渲染
   * --------------------------------------------------------- */
  function render() {
    var st = App.state;
    $('#me-sub').innerHTML = App.syncLabel();
    renderAvatar();

    if (!st.types.length) {
      $('#type-list').innerHTML = '<div class="hint center" style="padding:18px 0">还没有运动类型，点上面「+ 新增」创建一个吧</div>';
      return;
    }
    $('#type-list').innerHTML = st.types.map(function (t) {
      var n = st.records.filter(function (r) { return r.type_id === t.client_uuid && !r.deleted; }).length;
      return '<div class="type-row" data-id="' + t.client_uuid + '">' +
        '<span class="swatch" style="background:' + t.color + '"></span>' +
        '<span class="tn">' + U.esc(t.name) + '</span>' +
        '<span class="cnt">' + n + ' 次</span>' +
        '<span class="chev">›</span>' +
      '</div>';
    }).join('');

    $$('#type-list .type-row').forEach(function (el) {
      el.addEventListener('click', function () {
        var t = null;
        App.state.types.some(function (x) { if (x.client_uuid === el.dataset.id) { t = x; return true; } });
        if (t) openTypeSheet(t);
      });
    });
  }

  /* ---------------------------------------------------------
   *  类型抽屉
   * --------------------------------------------------------- */
  function openTypeSheet(t) {
    editingType = t || null;
    $('#type-title').textContent = t ? '编辑类型' : '新增类型';
    $('#type-name').value = t ? t.name : '';
    $('#type-color').value = t ? t.color : U.PRESET_COLORS[App.state.types.length % U.PRESET_COLORS.length];
    $('#type-delete').classList.toggle('hidden', !t);
    renderSwatches();
    preview();
    $('#sheet-type').classList.remove('hidden');
  }

  function closeTypeSheet() { $('#sheet-type').classList.add('hidden'); }

  function renderSwatches() {
    var cur = $('#type-color').value.toUpperCase();
    $('#type-swatches').innerHTML = U.PRESET_COLORS.map(function (c) {
      return '<i data-c="' + c + '" class="' + (c.toUpperCase() === cur ? 'on' : '') + '" style="background:' + c + '"></i>';
    }).join('');
    $$('#type-swatches i').forEach(function (el) {
      el.addEventListener('click', function () {
        $('#type-color').value = el.dataset.c;
        renderSwatches();
        preview();
      });
    });
  }

  function preview() {
    var c = $('#type-color').value;
    var n = $('#type-name').value.trim() || '类型名称';
    $('#type-preview').innerHTML = '<span class="dot" style="background:' + c + '"></span><b>' + U.esc(n) + '</b>';
    $('#type-preview').style.boxShadow = '0 6px 16px ' + U.rgba(c, .35);
  }

  $('#type-color').addEventListener('input', function () { renderSwatches(); preview(); });
  $('#type-name').addEventListener('input', preview);
  $('#type-cancel').addEventListener('click', closeTypeSheet);
  $('#sheet-type').addEventListener('click', function (e) { if (e.target === this) closeTypeSheet(); });
  $('#btn-add-type').addEventListener('click', function () { openTypeSheet(null); });

  /* 保存类型（本地优先：先落本地，后台同步云端） */
  $('#type-save').addEventListener('click', function () {
    var name = $('#type-name').value.trim();
    var color = $('#type-color').value;
    if (!name) return U.toast('给这个类型起个名字吧');
    if (name.length > 10) return U.toast('名字最多 10 个字');

    var btn = this;
    btn.disabled = true; btn.textContent = '保存中…';

    var isEdit = !!editingType;
    var now = new Date().toISOString();
    // 本地优先：整条类型落到本地存储（client_uuid 不变 → 幂等 upsert，永不复重）
    var t = isEdit ? editingType : { client_uuid: U.uuid(), created_at: now };
    t.name = name;
    t.color = color;
    t.sort_order = isEdit ? (editingType.sort_order || 0) : App.state.types.length;
    t.dirty = true;
    t.deleted = false;
    t.synced = isEdit ? (!!editingType.synced) : false;
    AppStore.putType(t);
    App.state.types = AppStore.loadTypes();
    closeTypeSheet();
    editingType = null;
    App.renderAll();
    U.toast('保存成功');
    App.maybeSync();

    btn.disabled = false; btn.textContent = '保存';
  });

  /* 删除类型（本地优先：标记删除并落盘，后台同步云端；引用它的记录转「未分类」） */
  $('#type-delete').addEventListener('click', function () {
    if (!editingType) return;
    var cuuid = editingType.client_uuid;
    var n = App.state.records.filter(function (r) { return r.type_id === cuuid && !r.deleted; }).length;
    var text = n
      ? '该类型下还有 <b>' + n + '</b> 条记录。<br>删除后这些记录会变成「未分类」，记录本身不会丢失。'
      : '确定删除这个运动类型吗？';

    U.confirmBox(text, '删除').then(function (ok) {
      if (!ok) return;
      editingType.deleted = true;                // 标记删除（待同步云端真实删除）
      editingType.dirty = true;
      AppStore.putType(editingType);
      // 引用该类型的记录改为未分类，并标记待同步
      var recs = AppStore.loadRecords().map(function (r) {
        if (r.type_id === cuuid) { r.type_id = ''; r.dirty = true; }
        return r;
      });
      AppStore.saveRecords(recs);
      App.state.types = AppStore.loadTypes();
      App.state.records = AppStore.loadRecords();
      if (App.state.filterType === cuuid) App.state.filterType = 'all';
      closeTypeSheet();
      editingType = null;
      App.renderAll();
      U.toast('已删除');
      App.maybeSync();
    }).catch(function (err) { U.toast(API.msg(err)); });
  });

  /* ---------------------------------------------------------
   *  CSV 导出
   * --------------------------------------------------------- */
  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  $('#btn-export').addEventListener('click', function () {
    var recs = App.state.records.slice().sort(function (a, b) {
      return a.played_on < b.played_on ? -1 : (a.played_on > b.played_on ? 1 : 0);
    });
    if (!recs.length) return U.toast('还没有记录可以导出');

    var head = ['日期', '运动类型', '时长(分钟)', '耗力(1-5)', '费用(元)', '备注', '创建时间'];
    var lines = [head.join(',')];
    recs.forEach(function (r) {
      lines.push([
        r.played_on,
        App.typeById(r.type_id).name,
        r.duration_min,
        r.effort,
        Number(r.cost || 0),
        r.note || '',
        (r.created_at || '').replace('T', ' ').slice(0, 19)
      ].map(csvCell).join(','));
    });

    // 汇总行
    var min = recs.reduce(function (a, r) { return a + Number(r.duration_min || 0); }, 0);
    var cost = recs.reduce(function (a, r) { return a + Number(r.cost || 0); }, 0);
    lines.push('');
    lines.push(['合计', recs.length + '次', min, '', Math.round(cost * 100) / 100, '', ''].map(csvCell).join(','));

    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var name = '网球记录_' + U.todayStr() + '.csv';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    U.toast('已导出 ' + recs.length + ' 条记录');
  });

  /* ---------------------------------------------------------
   *  添加到桌面
   * --------------------------------------------------------- */
  $('#btn-install').addEventListener('click', function () {
    var dp = window.__deferredPrompt;
    if (dp) {
      dp.prompt();
      dp.userChoice.then(function () { window.__deferredPrompt = null; });
      return;
    }
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    U.confirmBox(isIOS
      ? '在 Safari 里点击底部的<b>「分享」</b>按钮，<br>选择<b>「添加到主屏幕」</b>即可 ' + U.svg('tennis')
      : '在浏览器菜单里选择<br><b>「添加到主屏幕 / 安装应用」</b>即可 ' + U.svg('tennis'), '知道啦');
  });

  /* ---------------------------------------------------------
   *  退出登录
   * --------------------------------------------------------- */
  $('#btn-logout').addEventListener('click', function () {
    U.confirmBox('确定退出登录吗？<br><span style="font-size:12px;color:#A79FB0">数据都在云端，重新登录还在</span>', '退出')
      .then(function (ok) {
        if (!ok) return;
        App.state.explicitSignOut = true;
        return API.signOut();
      }).catch(function (e) { console.warn(e); });
  });

  /* ---------------------------------------------------------
   *  头像上传（压缩到 160px，存云端，不占本地、不拖慢页面）
   * --------------------------------------------------------- */
  if ($('#me-avatar')) {
    $('#me-avatar').addEventListener('click', function () { if ($('#me-avatar-input')) $('#me-avatar-input').click(); });
  }
  if ($('#me-avatar-input')) {
    $('#me-avatar-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) { U.toast('图片请小于 6MB'); $('#me-avatar-input').value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var s = 160, c = document.createElement('canvas'); c.width = s; c.height = s;
          var ctx = c.getContext('2d');
          var sc = Math.max(s / img.width, s / img.height);
          var w = img.width * sc, h = img.height * sc;
          ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
          var data = c.toDataURL('image/jpeg', 0.82);
          $('#me-avatar-input').value = '';
          API.updateProfile({ avatar: data }).then(function (res) {
            if (res.error) throw res.error;
            if (App.state.user) {
              App.state.user.user_metadata = Object.assign({}, App.state.user.user_metadata, { avatar: data });
            }
            renderAvatar();
            U.toast('头像已更新 ☁️');
          }).catch(function (err) { U.toast(API.msg(err)); });
        };
        img.onerror = function () { U.toast('图片读取失败'); $('#me-avatar-input').value = ''; };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  }

  /* 冲澳档案：「查看未上传的记录」按钮 → 打开同步自查面板（列出具体未上传的记录） */
  if ($('#btn-sync-detail')) {
    $('#btn-sync-detail').addEventListener('click', function () { App.openDiag(); });
  }

  return { render: render, openTypeSheet: openTypeSheet };
})();
