# ToolWeb  静态站

把原来的 WordPress 主题重构成**纯静态站点**：不依赖 PHP / 数据库 / 后端，改完数据跑一条命令生成全部 HTML，直接部署到 Cloudflare Pages。

- **零运行时依赖**：没有框架、没有 CDN 外链，CSS / JS 全部本地文件
- **零构建依赖**：构建脚本只用 Node 内置模块，不用 `npm install`
- **体积极小**：整站 24 个文件、约 350 KB，最大单文件 42 KB（Cloudflare 限制是单文件 25 MB、总量 20000 个文件）
- **SEO 完整**：静态 HTML、canonical、OG / Twitter 卡片、JSON-LD 结构化数据、sitemap.xml、robots.txt
- **核心功能保留**：12 款在线工具、工具大全、网址导航、客户端搜索、分类筛选、深浅色主题、响应式

---

## 1. 目录结构

```
新/
├─ build.js                ← 构建脚本（入口，node build.js）
├─ site.config.js          ← 站点配置：站点名 / 主题色 / 首页 / 页脚 / 下载按钮 / SEO
├─ content/
│  ├─ tools.js             ← 工具数据（增删工具只改这里）
│  └─ sites.js             ← 网址数据（增删网址只改这里）
├─ src/                    ← 构建期模板（不参与部署）
│  ├─ utils.js             ← 转义、slug、URL 拼接等工具函数
│  ├─ layout.js            ← 页面骨架：<head> / 页头 / 抽屉 / 搜索面板 / 页脚
│  └─ pages.js             ← 各页面片段：首页 / 工具大全 / 网址导航 / 工具详情 / 404
├─ assets/                 ← 静态资源（原样复制进 dist）
│  ├─ css/main.css         ← 全部样式（含深浅色、响应式）
│  └─ js/
│     ├─ main.js           ← 前端交互：主题、抽屉、搜索、筛选、复制、回到顶部
│     └─ tools.js          ← 12 款工具的算法实现
├─ downloads/              ← 可选：工具页「下载」按钮指向的本地文件，构建时复制到 dist/downloads/
├─ test/
│  └─ smoke.js             ← 回归测试（不参与部署，见第 7 节）
├─ preview.bat             ← ★ Windows 双击这个就能本地预览
├─ dev-server.js           ← 本地预览服务器（零依赖，preview.bat 会调用它）
├─ dist/                   ← ★ 构建产物，部署时只用这个目录
└─ README.md               ← 本文档
```

**部署时只需要 `dist/`。** `src/`、`node_modules`、`test/` 都不会被打包进去。

### 构建产物（`dist/`）长什么样

```
dist/
├─ index.html              首页
├─ 404.html                404 页
├─ tools/index.html        工具大全
├─ sites/index.html        网址导航
├─ tools/json/index.html   ← 12 个工具详情页，每款一个目录
├─ tools/base64/index.html
├─ ...
├─ assets/
│  ├─ css/main.css
│  ├─ js/main.js
│  ├─ js/tools.js
│  ├─ js/search-index.js   ← 构建时生成的搜索索引
│  └─ favicon.svg          ← 构建时按主题色生成的图标
├─ sitemap.xml
├─ robots.txt
└─ _headers                ← Cloudflare Pages 用的响应头配置
```

共 **16 个页面 / 24 个文件**。

---

## 2. 快速开始

需要 **Node.js 18 或更高版本**（构建脚本本身不需要 `npm install`）。

```bash
cd 新

# 构建：生成 dist/
node build.js

# 本地预览（必须用 HTTP 服务，不能直接双击 index.html）
node dev-server.js
```

---

### 2.1 Windows 上怎么打开看效果

**最简单：双击 `新\preview.bat`。** 它会自动启动本地服务并弹出浏览器。

也可以用命令行（推荐，出错时能看到日志）：

```bat
:: 方式 1：项目自带脚本（零依赖，会自动打开浏览器）
cd /d "F:\工具站\新"
node dev-server.js

:: 方式 2：换成别的端口起点（默认 8788）
node dev-server.js 9000

:: 方式 3：不自动开浏览器，只看日志
node dev-server.js 8788 --no-open

:: 方式 4：手动浏览器打开
start http://127.0.0.1:8788/
```

按 `Ctrl + C` 停止服务。浏览器地址默认是 **http://127.0.0.1:8788/**。

> **端口被占用不会报错。** 脚本会自动往后找空闲端口（最多试 20 个），并在启动信息里告诉你实际用的是哪个，浏览器也会打开正确的地址。所以「已经开着一个预览窗口」时再双击一次也不会出问题。

> ⚠️ **千万不要双击 `dist\index.html`。** 站内资源用的是根路径 `/assets/...`，`file://` 协议下浏览器会去磁盘根目录找 `F:\assets\css\main.css`，结果是**样式全丢、工具全打不开**。必须通过 HTTP 服务访问。
>
> 同理，如果本地已经装了 VS Code，装个 Live Server 插件右键 `dist/index.html` 也能用；但**别用「Open with Live Server」之外的纯文件打开方式**。

**打开源码目录**（想直接看/改文件时）：在文件资源管理器地址栏里粘 `F:\工具站\新` 回车即可；或者 Win + R 输入 `explorer F:\工具站\新`。

<details>
<summary>不想用 Node 的话，Python 也行</summary>

```bat
cd /d "F:\工具站\新"
python -m http.server 8788 --bind 127.0.0.1 --directory dist
:: 然后手动打开 http://127.0.0.1:8788/
```

注意 Python 的 `http.server` 不带 404 兜底（找不到会返回它自己的目录列表页），也不禁用缓存，只建议临时用。日常还是用 `preview.bat`。
</details>

---

构建成功后会输出：

```
✔ 构建完成 → dist/

  页面数        16
  工具          内置 12 款 / 外链 0 款
  网址          10 个，分 4 类
  下载按钮      未配置（在 site.config.js 的 toolDownload 里填 url）
  产出文件      24 个，合计 316.3 KB
  最大文件      assets\js\tools.js（41.9 KB）
  部署根路径    /
  资源版本号    03bde7d3
```

> 「下载按钮」那行会告诉你配置有没有生效：填了 `toolDownload.url` 之后它会变成「12 个工具页已启用」。
>
> 「资源版本号」是本次构建算出的内容哈希，会写进每个页面的资源 URL。**看到它变了，就说明 CSS/JS 内容变了**，浏览器会重新拉取而不吃旧缓存（详见第 9 节）。

---

## 3. 部署到 Cloudflare Pages

### 方式 A：直接上传（最简单）

1. 执行 `node build.js` 生成 `dist/`
2. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
3. 把 **`dist` 目录里的内容**（不是 `dist` 文件夹本身）拖进去，或打包成 zip 上传
4. 完成。之后每次改内容，重新上传一次即可

### 方式 B：连接 Git 仓库（改完自动部署）

1. 把整个 `新/` 目录推到 GitHub / GitLab 仓库
2. Cloudflare Pages → **Connect to Git** → 选择仓库
3. 构建设置填：

   | 项目 | 值 |
   |---|---|
   | Framework preset | `None` |
   | Build command | `node build.js` |
   | Build output directory | `dist` |

4. 保存后每次 push 都会自动重新构建部署

### 关于体积和文件数限制

Cloudflare Pages 的限制是**单个文件 ≤ 25 MiB、总文件数 ≤ 20000**。本站当前：

| 指标 | 当前 | 限制 | 余量 |
|---|---|---|---|
| 单文件最大 | 42 KB | 25 MB | 约 600 倍 |
| 文件总数 | 24 | 20000 | 约 830 倍 |
| 整站体积 | 350 KB | — | — |

即使把工具扩充到几百款也远远够用。想让体积更小，可以在构建后对 `dist` 做一次 gzip / brotli 预压缩，或在 Cloudflare 后台开启 Brotli（默认已开启，无需额外配置）。

---

## 4. 日常维护

### 4.1 新增一款内置工具

**第一步**：在 `content/tools.js` 里加一条数据：

```js
{
	slug: "my-tool",              // 必填，URL 标识，只能是 [a-z0-9-]
	name: "我的工具",              // 必填，卡片与页面标题
	icon: "🧪",                    // 必填，Emoji 图标
	category: "开发工具",          // 必填，同名自动归为同一分类
	desc: "一句话说明这个工具做什么。",   // 必填
	badge: "新",                   // 可选，详情页标题右侧角标
	featured: true,                // 可选，是否进首页「推荐工具」
	content: "<p>详情页正文（可选，对 SEO 有帮助）</p>",
}
```

**第二步**：在 `assets/js/tools.js` 里加同名实现，`key` 必须和 `slug` 完全一致：

```js
registry["my-tool"] = {
	build: function (root) {
		// 用内置助手拼 UI（见文件顶部的 el / labeled / textarea / input /
		// button / actions / grid / statusLine / copyButton 等）
		var source = textarea("输入…", 8);
		var result = textarea("结果…", 8, true);
		var status = statusLine();

		root.appendChild(grid([labeled("输入", source, ""), labeled("输出", result, "")]));
		root.appendChild(
			actions([
				button("执行", "", function () {
					result.value = source.value.toUpperCase();
					setStatus(status, "✅ 完成", "ok");
				}),
			])
		);
		root.appendChild(status);

		return {
			reset: function () {          // 可选：详情页「重置」按钮会调用
				source.value = "";
				result.value = "";
				setStatus(status, "", "");
			},
		};
	},
};
```

**第三步**：重新构建

```bash
node build.js
```

> 构建时会自动校验「数据里的 slug」与「`tools.js` 里的实现」是否一一对应。
> 漏写实现会直接**报错并终止构建**，并打印出缺哪个 slug，不会出现上线后工具打不开的情况。

### 4.2 新增一个「外链工具」（不生成详情页）

如果某个工具由别的站点提供，加 `url` 字段即可。卡片会直接跳外站，**不生成详情页**，页面数量不增加：

```js
{
	slug: "some-external",
	name: "外部工具",
	icon: "🌐",
	category: "开发工具",
	desc: "由第三方站点提供的工具。",
	url: "https://example.com",     // ← 有这一行就是外链工具
}
```

外链卡片会自动带上 `target="_blank"` 和 `rel="noopener nofollow"`。

### 4.3 新增 / 修改网址

编辑 `content/sites.js`：

```js
{
	name: "站点名",                 // 必填
	url: "https://example.com",     // 必填，必须 https:// 开头
	icon: "🔖",                     // 必填，Emoji
	category: "开发社区",            // 必填，同名自动归为一组
	desc: "一句话简介。",            // 可选
	featured: true,                 // 可选，是否进首页「精选网址」
}
```

网址卡片直接指向目标站点，**不生成详情页**。

> **分类怎么来？** 不用单独维护分类列表。构建脚本按数据里 `category` 的出现顺序自动归组，并按条目数从多到少排序。改个分类名，就会自动多出一个分类。

### 4.4 改站点信息 / 首页文案 / 页脚 / 备案号

全部在 `site.config.js`：

```js
site: {
	name: "工具站",
	tagline: "在线工具箱 & 网址导航",
	description: "用于 SEO 的站点描述。",
	url: "https://example.com",     // ★ 上线前必须改成真实域名
	lang: "zh-CN",
	brandInitial: "工",              // 品牌图标里的字符
},

hero: {
	title: "一站式在线工具箱",
	subtitle: "首页副标题。",
	placeholder: "搜索框占位文字…",
	showSearch: true,               // 首页是否显示搜索框
	tags: ["JSON 格式化", "Base64"],  // 热门标签，点击直接触发搜索
},

footer: {
	copyright: "",                   // 留空自动生成「© 年份 站点名」
	icp: "京ICP备00000000号",         // 备案号，留空则不显示
},
```

> **页脚只有居中一行版权。** 早期版本页脚有一整块「品牌简介 + 快捷导航 + 工具分类 + 热门网址」四栏，
> 这些内容在页头导航、工具大全、网址导航里都有，属于重复；已整体移除（连带 `footer.about` 配置项）。
> 现在页脚只有一句居中的版权文字，填了 `icp` 才会多出一行备案链接。
> 想加别的内容，改 `src/layout.js` 的 `renderFooter()` 即可。

首页各区块的开关和数量在 `home` 里（推荐工具数量、展示几个分类、精选网址数量等），`code.head` / `code.footer` 可以插入统计脚本或站长验证代码。

### 4.5 给工具详情页加「下载」按钮

工具详情页右上角可以加一个下载按钮（排在「重置」左边）。**有链接才显示** —— 两处都没填链接时按钮根本不渲染，不会留下点了没反应的死按钮。

**配法一：全局模板（改一处，12 个工具页全都有）**

```js
// site.config.js
toolDownload: {
	enabled: true,                   // 总开关，false 一键关掉所有下载按钮
	label: "下载工具",                // 按钮文字
	url: "/downloads/{slug}.zip",    // ★ 填这里才会出现按钮
	note: "",                        // 悬停提示文字，留空则不输出
	newTab: false,                   // 新标签页打开（外链建议 true）
	saveAs: false,                   // 加 HTML download 属性强制另存（仅同源链接有效）
},
```

`url` 支持三个占位符：`{slug}`、`{name}`、`{category}`（后两个会自动做 URL 编码）。上面这行会给 12 个工具分别生成 `/downloads/json.zip`、`/downloads/base64.zip`……

填成整包链接也行，比如 `https://pan.example.com/toolbox`，这样 12 个页面指向同一个地址。

**配法二：单个工具单独指定（覆盖全局）**

```js
// content/tools.js
{
	slug: "json",
	name: "JSON 格式化",
	download: "https://cdn.example.com/json-tool.zip",   // 字符串 = 直接给链接
	// …其他字段
},
```

`download` 的三种写法：

| 写法 | 效果 |
|---|---|
| `download: "https://…"` | 用这个链接；文字 / 提示 / 新窗口等仍沿用全局 |
| `download: { url, label, note, newTab, saveAs }` | 只覆盖写了的项，其余沿用全局 |
| `download: false` | **这个工具不显示**下载按钮 |

**下载文件放哪儿：项目根部的 `downloads/`**

如果下载链接指向自己站上的文件（形如 `/downloads/xxx.zip`），把文件放在**项目根部的 `downloads/` 目录**，构建时会原样复制到 `dist/downloads/`，并在构建报告里列出数量。

> ⚠️ **不要直接往 `dist/downloads/` 里丢文件** —— 每次构建都会清空重建 `dist/`，放进去的东西下一轮就没了。
> 另外单个文件超过 **25 MB**（Cloudflare Pages 单文件上限）时构建会直接警告，避免白部署一次。

### 4.6 换主题色 / 圆角 / 内容宽度

```js
appearance: {
	primaryColor: "#2563eb",   // 主题色，深色模式下会自动提亮
	radius: 14,                // 圆角基准值 px
	containerWidth: 1200,      // 内容最大宽度 px（960 ~ 1600）
	defaultMode: "auto",       // auto 跟随系统 / light / dark
},
```

这几个值会在构建时内联进每个页面的 `<style>`，所以换配色**不需要改 CSS 文件**。

---

## 5. 路径与 SEO

### 固定的两个路径前缀

`/tools/` 和 `/sites/` 由构建脚本固定生成，不在配置里改。

### 部署到子目录

只改 `site.url` 一处即可，构建脚本会自动把子路径写进所有链接、canonical、sitemap：

```js
site: { url: "https://example.com/toolbox" }
```

构建报告里的「部署根路径」会相应变成 `/toolbox/`。

### 自动产出的 SEO 文件

| 文件 | 说明 |
|---|---|
| `sitemap.xml` | 自动收录全部 15 个可索引页面（含首页 / 两个聚合页 / 12 个工具页），404 页自动排除 |
| `robots.txt` | 允许全站抓取，并指向 sitemap |
| `_headers` | Cloudflare Pages 专用：`/assets/*` 长缓存 + 安全响应头（nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy） |
| `canonical` | 每页唯一地址，已在 `<head>` 生成 |
| JSON-LD | 首页 `WebSite`、聚合页 `CollectionPage`、工具页 `SoftwareApplication`、全站 `BreadcrumbList` |

429 页（404）自动带 `noindex, follow`。

### 搜索是怎么工作的

没有后端，所以搜索是**纯前端**的：

1. 用户第一次在搜索框输入时，`main.js` 才去加载 `assets/js/search-index.js`（懒加载，首屏不受影响）
2. 索引里包含全部工具与网址的名称、简介、分类
3. 匹配规则：多关键词 AND 命中，名称命中权重更高，最多展示 8 条

工具大全页还有独立的**即时筛选**：输入关键词按名称/描述过滤，点分类按钮按分类过滤，两者可叠加。计数会实时更新。

---

## 6. 与原来 WordPress 主题的对应关系

| 原主题功能 | 现在怎么实现 |
|---|---|
| WordPress 主题（PHP 模板） | `src/*.js` 构建期模板，输出静态 HTML |
| 后台「工具」自定义文章类型 | `content/tools.js` 数据文件 |
| 后台「网址」自定义文章类型 | `content/sites.js` 数据文件 |
| 分类法（tool_cat / site_cat） | 按 `category` 字段自动归组，无需单独维护 |
| 定制器（主题色 / 圆角 / 宽度 / 页脚 / 备案号） | `site.config.js` |
| —（新增）工具页「下载」按钮 | `site.config.js` 的 `toolDownload`，可在 `content/tools.js` 里按工具覆盖 |
| AJAX 实时搜索 | 客户端搜索 + 懒加载索引（`search-index.js`） |
| 内置工具注册表 + 12 款工具算法 | 原样保留，逻辑未改：`assets/js/tools.js` |
| 深浅色切换、首屏无闪烁 | 保留，内联 `<head>` 脚本 + `localStorage` |
| 移动端抽屉、回到顶部、复制、Toast | 保留 |
| SEO 模块（meta / OG / Twitter / JSON-LD） | 保留，构建时静态输出 |
| 最新文章 / 博客 | **已移除**（静态站没有编辑器，维护成本高） |
| 评论、侧栏、文章分页、小工具 | **已移除**（无对应数据源） |

移除的都是依赖 WordPress 运行时的部分，**工具、网址、搜索、筛选、主题这些核心功能一个没少**。

---

## 7. 回归测试

`test/smoke.js` 会用 jsdom 加载真实的 `dist/` 产物，实际执行 `main.js` + `tools.js`，逐款验证 12 个工具的输入输出，共 **297 项断言**，覆盖：

- 12 款工具的算法正确性（如 JSON 格式化/压缩、Base64 中文编解码、SHA-256/SHA-1 摘要值、UUID v4 格式、日期差计算、进制互转、正则捕获分组、颜色转换…）
- 每款工具的挂载成功、无脚本报错、异常输入报错
- 工具大全的关键词筛选 + 分类筛选 + 空状态
- 工具下载按钮（占位符替换与 URL 编码、工具级覆盖规则、`download:false` / `enabled:false` 的关闭语义、真实渲染出的 `href`/`target`/`download` 属性）
- 搜索索引、sitemap、robots、`_headers` 内容
- 页面骨架（标题、canonical、页头页脚、跳转链接、主题初始化）
- CSS 覆盖检查（HTML 用到的 class 都有样式，没有移植遗漏）
- `hidden` 属性防护（`[hidden]{display:none !important}` 兜底规则必须存在——jsdom 抓不到样式层叠问题）
- 资源版本号（每个页面的 CSS/JS/favicon URL 都带版本号且全站一致，`main.js` 取版本号的正则能正确提取）
- 断链检查（页面引用的每个 `/assets/...` 和站内链接都真实存在；下载按钮的链接除外——那是你填的外部地址）

运行方式（jsdom 仅测试需要，构建不需要）：

```bash
npm i -D jsdom
node test/smoke.js
```

**改完工具逻辑后建议跑一遍**，避免改坏某款工具。

---

## 8. 常见问题

**Q：改完代码为什么不生效？**
静态站是构建出来的，改 `content/`、`src/`、`assets/`、`site.config.js` 之后都要重新执行 `node build.js`（用了 Git 自动部署的，push 后会自动构建）。

**Q：改了 CSS/JS，线上访客还是看到旧的怎么办？**
正常情况下不会——构建时会自动给资源 URL 加上内容哈希版本号（`main.css?v=ba677632`），
内容一变 URL 就变，`immutable` 长缓存会被绕过。如果确实没更新，按顺序排查：
① 确认重新跑过 `node build.js`（看构建报告里的「资源版本号」有没有变）；② 确认 `dist/` 真的重新部署上去了；
③ 用无痕窗口打开，排除本地代理/运营商缓存。

**Q：本地打开 HTML 页面样式全乱了？**
不能双击打开。资源路径是 `/assets/...`，必须起一个 HTTP 服务（见第 2 节）。**Windows 上双击 `preview.bat` 即可。**

**Q：双击 `preview.bat` 闪退？**
脚本找不到 Node.js 时会停下来提示。如果确认装了 Node 还是提示找不到，说明 `PATH` 没刷新——关掉窗口重开，或者直接重启一次。也可以手动跑 `node dev-server.js` 看具体报错。

**Q：`preview.bat` 提示「端口 8788 已被占用，已自动改用 8789」？**
不用管，脚本会自己顺延到空闲端口并在浏览器里打开正确的地址。出现这个提示通常是因为**已经开着一个预览窗口**——那直接用旧窗口就行。如果连续 20 个端口都被占（几乎不可能），才需要手动指定：`preview.bat 9000`。

**Q：想加一个纯静态的介绍页 / 关于页怎么做？**
在 `src/pages.js` 里仿照 `toolsHub()` 写一个函数返回 `{ title, description, path, nav, body }`，然后在 `build.js` 的 `taskList` 里加一项，并把它加进 `src/layout.js` 的 `NAV` 数组用于顶部导航。

**Q：工具页的下载按钮怎么没出现？**
这是有意的——**没填链接就不渲染按钮**。去 `site.config.js` 的 `toolDownload.url` 填上地址（支持 `{slug}` 占位符），或者在 `content/tools.js` 里给某个工具写 `download`。构建报告里的「下载按钮」一行会告诉你当前状态。

**Q：为什么图标只能用 Emoji，不能用图片？**
为了控制文件数量（Cloudflare 有 20000 文件上限，每个图标一个文件很容易膨胀）。Emoji 零请求、无色差、深浅色都清晰。如果确实要换成图片，把 `tool.icon` 改成 `<img>` 标签即可，但要注意页面上 `icon` 是经过转义的——需要改用 `content` 字段或调整 `src/pages.js` 的卡片渲染。

**Q：搜索能用中文拼音 / 模糊匹配吗？**
当前是子串匹配。要做拼音搜索，可以在 `build.js` 的 `renderSearchIndex()` 里给每条数据加一个拼音字段，再在 `main.js` 的 `search()` 里一起参与匹配。

**Q：工具计算结果会上传到服务器吗？**
不会。全部算法在浏览器本地执行，页面没有任何上报请求。

**Q：怎么给整站加访问统计？**
在 `site.config.js` 的 `code.head` 或 `code.footer` 里粘统计脚本即可，会注入到每个页面。

---

## 9. 技术说明

- **构建脚本**：`build.js` 只依赖 Node 内置的 `fs` / `path`，无第三方包
- **HTML 转义**：`src/utils.js` 的 `esc()` 对所有动态文本做转义，避免数据里出现特殊字符导致页面结构破坏
- **`hidden` 属性必须带兜底规则**：`main.css` 里有一条 `[hidden] { display: none !important }`。
  原因是浏览器默认样式里的 `[hidden]{display:none}` 属于 **UA 样式**，优先级低于本站 CSS 里的**任何** `display` 声明。
  `.tw-card` 是 `display:flex`、`.tw-totop` 是 `display:inline-flex`，少了这条兜底，JS 设了 `el.hidden = true`
  元素照样显示（表现就是工具大全的分类筛选「点了没反应」）。**不要把它当成冗余删掉**，
  `test/smoke.js` 里有专门的断言守着它。
- **构建期校验**：slug 唯一性、必填字段、URL 格式、工具实现覆盖率，任一不通过都会终止构建
- **缓存策略**：`_headers` 里 `/assets/*` 设为 `immutable` 一年，配合**构建期自动生成的内容版本号**使用。
  构建时会把 `main.css` / `main.js` / `tools.js` / `search-index.js` / `favicon.svg` 的内容算成一个短哈希，
  拼在 URL 上（`/assets/css/main.css?v=ba677632`）。**内容一变哈希就变，URL 随之改变，immutable 缓存才会被正确绕过。**
  所以你**不需要**手动改文件名版本号了 —— 改完源码跑一次 `node build.js` 就行，构建报告里会打印新的「资源版本号」。
  全站资源共用一个版本号（整站才 350 KB，任一文件变化就让全部资源一起更新，实现简单且不会漏）。
- **主题**：浅色 / 深色两套 CSS 变量；禁用 JS 时通过 `prefers-color-scheme` 跟随系统偏好
- **无障碍**：跳转链接、`aria-*` 属性、键盘操作（`/` 或 `Ctrl/Cmd + K` 打开搜索、方向键在结果间移动、Esc 关闭）、`prefers-reduced-motion` 动效降级
