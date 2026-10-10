# 🎾 打进澳网

> 可爱又简洁的网球运动记录 PWA。  
> 手机优先 · iOS Safari / 安卓浏览器兼容 · 可添加到桌面 · **数据全部存云端，换设备登录自动同步**。

> 🌐 线上地址：**https://susustarrrrrr.github.io/tennis-log/**

![](./icons/icon-192.png)

---

## ✨ 核心功能

| 模块 | 能力 |
| --- | --- |
| 🪪 账号体系 | 注册/登录，所有记录绑定到你的账号 |
| 🎾 自定义运动类型 | 内置 **私教 / 练球 / 比赛** 3 种，可新增/删除/重命名，每种带独立主题颜色（明亮浅绿/浅黄/浅粉/浅橙预设） |
| 🗓 月历视图 | 当月每天一目了然，当天多类型用渐变叠加 |
| 📝 录入字段 | 运动类型 · 日期 · 时长 · 耗力 1‑5 级 · 费用 · 备注 |
| ✏️ 编辑 / 删除 | 任何一条记录都可改可删，月历同步刷新 |
| 📊 统计看板 | 本月 / 本年 / 全部：频次、累计时长、累计花费、耗力分布、类型分布、月度柱状图 |
| 📤 CSV 导出 | 一键备份全部记录 |
| 📱 添加到桌面 | PWA 启动，原生 App 体验（iOS「添加到主屏幕」/ Android「安装应用」） |
| ☁️ 多设备同步 | 全部数据走 Supabase，**不依赖浏览器 localStorage** |

---

## 🚀 部署步骤

整个项目是纯静态文件，**零构建**，可以直接放在任何静态网站托管：

### ① Fork / Clone 到你的 GitHub

```bash
git clone https://github.com/你的名字/tennis-log.git
cd tennis-log
```

### ② 创建 Supabase 项目（免费版即可）

1. 进入 <https://supabase.com/dashboard> → **New project**
2. 选一个离你近的 Region（香港 / 新加坡都很香）
3. 等待约 1 分钟项目初始化完成

### ③ 执行 SQL 建表

1. 项目控制台左侧 **SQL Editor** → **New query**
2. 把 `supabase/schema.sql` 内容粘贴进去
3. 点 **Run**（绿三角按钮）执行

执行成功后会在左侧 **Table Editor** 看到两张新表：
`sport_types`、`play_records`，都已经启用了行级安全策略 (RLS)。

### ④ 拿到 Project URL 和 Publishable key

1. 左侧 **Project Settings** → **API**
2. 复制
   - **Project URL** （形如 `https://xxxxx.supabase.co`）
   - **Publishable key**（形如 `sb_publishable_...`；旧版叫 anon / public key）

> 这两个是公开可见的、官方要求放在前端的密钥。  
> 千万不要复制 **service_role** key，那个只允许在服务端使用。

### ⑤ 写入前端配置（本项目已预填，通常可跳过）

源码 `js/config.js` 里已经替你填好了云端地址和 Publishable key，**部署后即可直接使用**，一般不用改。

想换成自己的项目时，把：

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_...'
};
```

改成你自己的值即可。  
也可以不改源码：App 登录页底部点「数据库连接设置」可临时覆盖（仅存本机）。

### ⑥ 上传到 GitHub Pages / Vercel / Netlify / CloudStudio 等任意静态托管

#### GitHub Pages

```bash
git add -A
git commit -m "feat: 网球小本本"
git push
```

然后：

1. GitHub 仓库 → **Settings** → **Pages**
2. Source 选 `main` 分支 / 根目录 → Save
3. 等待 1 分钟，访问 `https://susustarrrrrr.github.io/tennis-log/` 即可

> 仓库根目录已经放了一个空的 `.nojekyll` 文件，避免 GitHub 用 Jekyll 过滤下划线开头的文件。

#### Vercel / Netlify

直接拖拽整个 `tennis-log/` 文件夹到页面，或者链接仓库一键部署即可。

### ⑦ 添加到手机桌面

- **Android / Chrome**：打开页面 → 浏览器菜单 → 「安装应用 / 添加到主屏幕」
- **iOS Safari**：打开页面 → 底部分享按钮 ⤴︎ → 「添加到主屏幕」

之后可以像原生 App 一样从桌面图标打开，全屏运行 ✨

---

## 🧱 项目结构

```
tennis-log/
├── index.html              ← 单页入口
├── manifest.webmanifest    ← PWA 清单
├── sw.js                   ← Service Worker（离线外壳 + PWA 安装）
├── css/style.css           ← 全部样式（移动端优先、奶油配色）
├── js/
│   ├── config.js           ← Supabase 连接配置
│   ├── utils.js            ← 工具函数、格式化常量
│   ├── api.js              ← Supabase 认证 + 数据访问封装
│   ├── page-records.js     ← 记录列表页 + 录入抽屉
│   ├── page-calendar.js    ← 月历页 + 当日详情
│   ├── page-stats.js       ← 统计看板
│   ├── page-settings.js    ← 我的（类型管理 / 导出 / 退出）
│   └── app.js              ← 启动 / 导航 / 状态管理
├── icons/                  ← PWA 图标（含生成脚本）
├── supabase/schema.sql     ← 一键建表 + RLS 策略
├── README.md
└── .nojekyll
```

---

## 🛢️ 数据模型

### `sport_types`（运动类型）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `user_id` | uuid | 归属用户（关联 auth.users） |
| `name` | text(1‑10) | 类型名，如「私教」 |
| `color` | text | 主题色，十六进制 |
| `sort_order` | int | 排序，越小越靠前 |
| `created_at` | timestamptz | 创建时间 |

### `play_records`（打球记录）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `user_id` | uuid | 归属用户 |
| `type_id` | uuid | 关联 sport_types（可空 → 「未分类」） |
| `played_on` | date | 运动日期 |
| `duration_min` | int(1‑1440) | 时长（分钟） |
| `effort` | int(1‑5) | 耗力程度 |
| `cost` | numeric(10,2) | 费用（元） |
| `note` | text | 备注 |
| `created_at` / `updated_at` | timestamptz | 创建 / 更新时间 |

> ⚠️ 删除一个运动类型，**记录本身不会丢**，只是 `type_id` 被置空并显示为「未分类」。

---

## 🔒 安全设计

- 所有表都开启 **RLS**（行级安全）
- 任何人（包括未登录用户）都无法跨账号读写
- Publishable key（即 anon key）仅用于浏览器端，配合 RLS 才能访问自己的数据
- Supabase Auth 自动签发 JWT，前端每次请求带上 `Authorization: Bearer ...`

---

## 🧪 自测清单

> 部署完成后，按这条清单逐项验证。

- [x] **1.** 注册账号，新建自定义运动类型，修改自定义颜色，保存成功
- [x] **2.** 录入一条打球记录，填写时长、耗力、费用、备注，保存成功
- [x] **3.** 月历页面：对应日期显示该类型自定义颜色；点击日期，弹出完整记录信息
- [x] **4.** 记录可以编辑、删除，月历同步更新
- [x] **5.** 月度统计数值正确：总时长、次数、总花费计算无误
- [x] **6.** 同一账号，换一台手机浏览器登录，**全部历史记录完整同步**（关键，不能只存在本机）
- [x] **7.** 清除浏览器缓存，重新登录账号，**数据不会丢失**
- [x] **8.** 安卓、苹果手机浏览页面，布局不溢出，表单按钮可正常点击
- [x] **9.** 可以添加到手机桌面，以 PWA 方式打开使用
- [x] **10.** 可导出 CSV 备份全部运动记录

---

## ❓ 常见问题

**Q1. 注册后登录提示「账号还没激活 / 邮箱没验证」？**  
A. 本项目用「昵称」注册，底层邮箱是自动生成的、无法收信，所以**必须关闭邮箱验证**：Supabase 控制台 → **Authentication → Providers → Email** → 关闭 **「Confirm email」** → Save。关掉后用同一昵称重注册即可直接登录。若你坚持保留邮箱验证，请改用真实邮箱注册（「数据库连接设置」里仍可用邮箱登录）。

**Q2. 登录报错 `数据表还没建好`？**  
A. 没有执行 `supabase/schema.sql`。再贴一次运行即可。

**Q3. 我直接打开 `index.html` 也能跑吗？**  
A. 通过 `file://` 打开基本能跑，但 Service Worker / 部分浏览器 API 失效。**强烈建议部署到 GitHub Pages** 体验完整 PWA。

**Q4. 怎么彻底删除账号？**  
A. Supabase 控制台 → Authentication → Users → 选用户 → Delete。关联的 `sport_types` 和 `play_records` 会因 `on delete cascade` 自动清理。

**Q5. 数据归属？**  
A. 所有数据存放在 **你自己创建** 的 Supabase 项目里，不归任何第三方。CSV 一键导出是永远属于你的备份方案。

---

## 🛠️ 自定义 / 二次开发

- 改配色：编辑 `css/style.css` 顶部的 `:root`
- 改默认运动类型：编辑 `js/utils.js` 里的 `DEFAULT_TYPES`
- 改 Icon：跑 `icons/make_icons.py`（纯 Python 标准库，可换成你喜欢的图）

---

## 📜 License

MIT — 自由使用，欢迎魔改和分享 🍀