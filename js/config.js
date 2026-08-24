/* ===========================================================
 *  config.js  —  Supabase 连接配置
 *
 *  已为你预填好云端地址与 Publishable key（发布密钥）。
 *  ⚠️ 只能填 publishable key / anon key，绝不要填 service_role key。
 *
 *  想换成自己的项目：改下面两个值即可；或在 App 里点
 *  「数据库连接设置」临时覆盖（仅存本机，不存任何打球数据）。
 * =========================================================== */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://jkicokggpewvxdncnukm.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7MTHPTg581B07kg2nlauRQ_2DUf5Z5g'
};

window.Config = (function () {
  var LS_URL = 'tb_sb_url';
  var LS_KEY = 'tb_sb_key';

  /** 优先用源码里的硬编码配置；没有则读本机临时填写的连接信息 */
  function get() {
    var url = (window.APP_CONFIG.SUPABASE_URL || '').trim();
    var key = (window.APP_CONFIG.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) {
      try {
        url = url || localStorage.getItem(LS_URL) || '';
        key = key || localStorage.getItem(LS_KEY) || '';
      } catch (e) { /* 隐私模式下 localStorage 不可用 */ }
    }
    return { url: url.replace(/\/+$/, ''), key: key };
  }

  function isReady() {
    var c = get();
    return !!(c.url && c.key && c.key.length > 20);
  }

  /** 仅保存「连接服务用」的地址与公钥，不含任何打球业务数据 */
  function save(url, key) {
    try {
      localStorage.setItem(LS_URL, url.trim().replace(/\/+$/, ''));
      localStorage.setItem(LS_KEY, key.trim());
    } catch (e) {
      alert('浏览器禁用了本地存储，请改为直接修改 js/config.js');
    }
  }

  function clear() {
    try { localStorage.removeItem(LS_URL); localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  return { get: get, isReady: isReady, save: save, clear: clear };
})();
