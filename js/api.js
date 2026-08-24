/* ===========================================================
 *  api.js  —  Supabase 认证 + 云端数据访问层
 *  所有打球业务数据只在云端，本地不做任何业务缓存。
 * =========================================================== */
window.API = (function () {

  var sb = null;

  function init() {
    if (!window.Config.isReady()) return null;
    if (sb) return sb;
    var c = window.Config.get();
    sb = window.supabase.createClient(c.url, c.key, {
      auth: {
        persistSession: true,      // 只持久化登录票据，不含业务数据
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return sb;
  }

  function client() { return sb || init(); }

  /* ---------------- 账号 ---------------- */

  /** 用户名 → 稳定的 ASCII 邮箱（RLS 仍按 auth.uid() 隔离）
   *  用户可输入中文 / 任意昵称，这里用 FNV-1a 哈希成 u+base36@tennisbook.app。
   *  同一昵称永远映射到同一邮箱，换设备登录也能找回同一个账号。 */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(36);
  }
  function toEmail(name) {
    name = String(name || '').trim().toLowerCase();
    return 'u' + hashStr(name) + '@tennisbook.app';
  }

  function signUp(name, password) {
    return client().auth.signUp({
      email: toEmail(name),
      password: password,
      options: { data: { username: String(name || '').trim() } }
    });
  }
  function signIn(name, password) {
    return client().auth.signInWithPassword({ email: toEmail(name), password: password });
  }
  function signOut() { return client().auth.signOut(); }
  function getSession() { return client().auth.getSession(); }
  function onAuth(cb) { return client().auth.onAuthStateChange(cb); }

  /** 把头像等资料写入账号 user_metadata（云端存储，跨设备一致） */
  function updateProfile(data) {
    return client().auth.updateUser({ data: data });
  }

  /** 显示用昵称（优先取注册时存的 username，跨设备一致） */
  function displayName(user) {
    if (!user) return '已登录';
    var m = user.user_metadata || {};
    if (m.username) return m.username;
    var e = (user.email || '').split('@')[0];
    return e || '已登录';
  }

  /* ---------------- 运动类型 ---------------- */

  function listTypes() {
    return client().from('sport_types').select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
  }

  function createType(uid, t) {
    return client().from('sport_types').insert({
      user_id: uid, name: t.name, color: t.color, sort_order: t.sort_order || 0
    }).select().single();
  }

  function updateType(id, patch) {
    return client().from('sport_types').update(patch).eq('id', id).select().single();
  }

  function deleteType(id) {
    return client().from('sport_types').delete().eq('id', id);
  }

  /** 新用户首次登录时写入默认 3 种类型 */
  function seedTypes(uid) {
    var rows = U.DEFAULT_TYPES.map(function (t) {
      return { user_id: uid, name: t.name, color: t.color, sort_order: t.sort_order };
    });
    return client().from('sport_types').insert(rows).select();
  }

  /* ---------------- 打球记录 ---------------- */

  function listRecords() {
    return client().from('play_records').select('*')
      .order('played_on', { ascending: false })
      .order('created_at', { ascending: false });
  }

  function createRecord(uid, r) {
    return client().from('play_records').insert({
      user_id: uid,
      type_id: r.type_id || null,
      played_on: r.played_on,
      duration_min: r.duration_min,
      effort: r.effort,
      cost: r.cost,
      note: r.note || null
    }).select().single();
  }

  function updateRecord(id, r) {
    return client().from('play_records').update({
      type_id: r.type_id || null,
      played_on: r.played_on,
      duration_min: r.duration_min,
      effort: r.effort,
      cost: r.cost,
      note: r.note || null,
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single();
  }

  function deleteRecord(id) {
    return client().from('play_records').delete().eq('id', id);
  }

  /* ---------------- 错误信息本地化 ---------------- */
  function msg(err) {
    if (!err) return '';
    var m = (err.message || String(err)).toLowerCase();
    if (m.indexOf('invalid login') >= 0) return '用户名或密码不对哦';
    if (m.indexOf('user already registered') >= 0 || m.indexOf('already been registered') >= 0) return '这个用户名已经被占用了，换一个或直接登录';
    if (m.indexOf('password should be at least') >= 0) return '密码至少要 6 位';
    if (m.indexOf('unable to validate email') >= 0 || m.indexOf('invalid email') >= 0) return '用户名不太对，换一个试试';
    if (m.indexOf('email not confirmed') >= 0) return '账号还没激活：请到 Supabase 后台 Authentication → Providers → Email 关闭「Confirm email」，再重新注册即可直接登录';
    if (m.indexOf('relation') >= 0 && m.indexOf('does not exist') >= 0) return '数据表还没建好，请先在 Supabase 里执行 schema.sql';
    if (m.indexOf('row-level security') >= 0 || m.indexOf('violates row-level') >= 0) return '权限策略拦截了，请检查 RLS 策略是否已创建';
    if (m.indexOf('failed to fetch') >= 0 || m.indexOf('networkerror') >= 0) return '网络连不上，检查一下网络或 Supabase 地址';
    if (m.indexOf('rate limit') >= 0 || m.indexOf('too many') >= 0) return '操作太频繁啦，稍等一会儿再试';
    return err.message || '出了点小问题，再试一次';
  }

  return {
    init: init, client: client, toEmail: toEmail, displayName: displayName,
    signUp: signUp, signIn: signIn, signOut: signOut, getSession: getSession, onAuth: onAuth, updateProfile: updateProfile,
    listTypes: listTypes, createType: createType, updateType: updateType, deleteType: deleteType, seedTypes: seedTypes,
    listRecords: listRecords, createRecord: createRecord, updateRecord: updateRecord, deleteRecord: deleteRecord,
    msg: msg
  };
})();
