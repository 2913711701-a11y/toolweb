/**
 * 工具数据源 —— 全站唯一的工具清单。
 *
 * 每个条目的字段：
 *   slug      必填，URL 标识，只能是 [a-z0-9-]，会生成 /tools/<slug>/ 页面
 *   name      必填，卡片与页面标题
 *   icon      必填，Emoji 图标（也支持内置 SVG 名：search/menu/close/sun/moon/arrow-up/copy/star/grid）
 *   category  必填，所属分类，同名自动归为同一分类
 *   desc      必填，一句话简介（卡片上最多显示两行）
 *   badge     可选，标题右侧角标，如「热门」「新」
 *   featured  可选，true 表示进入首页「推荐工具」区块
 *   content   可选，详情页正文 HTML（对 SEO 有帮助）
 *   url       可选，填写后该工具变成「外链工具」：卡片直接跳转，不生成详情页
 *             此时 slug 仍要唯一，但不会产出页面
 *   download  可选，详情页右上角「下载」按钮的链接。三种写法：
 *               "https://…/x.zip"                    → 直接用这个链接
 *               { url, label, note, newTab, saveAs } → 细粒度覆盖全局配置
 *               false                                → 这个工具不显示下载按钮
 *             不写则用 site.config.js 里 toolDownload 的全局配置；
 *             全局 url 也留空时，按钮整体不渲染（不会有死按钮）。
 *
 * ⚠️ 内置工具的实现算法在 assets/js/tools.js 里，key 必须与 slug 一致。
 *    slug 改动时两处都要改。
 */
module.exports = [
	{
		slug: "json",
		name: "JSON 格式化",
		icon: "🧩",
		category: "开发工具",
		badge: "热门",
		featured: true,
		desc: "在线 JSON 格式化、压缩与语法校验，错误位置精确到行列。",
		content:
			"<p>JSON 格式化工具支持一键美化、压缩与校验，所有解析都在浏览器本地完成，数据不会上传到服务器。</p>" +
			"<h3>使用场景</h3>" +
			"<ul><li>接口返回的 JSON 混乱难读时，快速格式化查看层级结构。</li>" +
			"<li>上线前压缩 JSON，减少传输体积。</li>" +
			"<li>排查 JSON 语法错误的具体位置。</li></ul>",
	},
	{
		slug: "base64",
		name: "Base64 编解码",
		icon: "🔐",
		category: "编码转换",
		badge: "热门",
		featured: true,
		desc: "支持 UTF-8 中文的 Base64 编码与解码，可选 URL 安全字符集。",
		content:
			"<p>Base64 编解码完全在本地执行，中文、Emoji 均可正确处理，并可选开启 URL 安全模式（将 + / 替换为 - _）。</p>",
	},
	{
		slug: "url",
		name: "URL 编解码",
		icon: "🔗",
		category: "编码转换",
		badge: "热门",
		featured: true,
		desc: "对链接参数进行百分号编码或还原，支持整体编码与组件编码。",
		content:
			"<p>处理带中文、空格或特殊符号的 URL。整体编码用于整条链接，组件编码用于单个查询参数值。</p>",
	},
	{
		slug: "hash",
		name: "哈希计算",
		icon: "🔒",
		category: "加密安全",
		featured: true,
		desc: "基于 Web Crypto 计算 SHA-1 / SHA-256 / SHA-384 / SHA-512 摘要。",
		content:
			"<p>使用浏览器原生 Web Crypto 接口计算文本摘要，不依赖任何第三方库，输出小写十六进制。</p>",
	},
	{
		slug: "password",
		name: "密码生成器",
		icon: "🔑",
		category: "加密安全",
		featured: true,
		desc: "使用加密级随机数生成高强度密码，可自定义字符集与长度。",
		content:
			"<p>密码使用 <code>crypto.getRandomValues</code> 生成，属于密码学安全随机源，并实时评估强度与破解耗时。</p>",
	},
	{
		slug: "uuid",
		name: "UUID 生成器",
		icon: "🆔",
		category: "开发工具",
		featured: true,
		desc: "批量生成符合 RFC 4122 的 UUID v4，支持大小写与去连字符。",
		content: "<p>批量生成唯一标识符，常用于主键、请求追踪 ID、文件名等场景。</p>",
	},
	{
		slug: "timestamp",
		name: "时间戳转换",
		icon: "⏱️",
		category: "时间日期",
		featured: true,
		desc: "Unix 时间戳与日期时间双向转换，自动识别秒与毫秒。",
		content:
			"<p>Unix 时间戳与本地/UTC 时间互转，自动识别 10 位（秒）与 13 位（毫秒）时间戳。</p>",
	},
	{
		slug: "datecalc",
		name: "日期计算器",
		icon: "📅",
		category: "时间日期",
		featured: true,
		desc: "计算两个日期之间的天数差，或在指定日期上加减天数。",
		content:
			"<p>支持「日期相差」与「日期推算」两种模式，结果包含自然日与工作日统计。</p>",
	},
	{
		slug: "radix",
		name: "进制转换",
		icon: "🔢",
		category: "编码转换",
		desc: "二进制、八进制、十进制、十六进制之间实时互转。",
		content:
			"<p>任意进制互转，输入任意一栏其余栏位实时更新，支持十六进制大写输出。</p>",
	},
	{
		slug: "text",
		name: "文本工具箱",
		icon: "📝",
		category: "文本处理",
		desc: "大小写转换、行排序、去重、去空行、反转与字符统计。",
		content:
			"<p>批量文本清洗利器：一键转换大小写、按行排序、去除重复行与空行，并实时统计字符、单词、行数与字节数。</p>",
	},
	{
		slug: "regex",
		name: "正则测试",
		icon: "🔍",
		category: "文本处理",
		desc: "实时测试正则表达式，高亮全部匹配并列出捕获分组。",
		content:
			"<p>输入正则与测试文本即可实时查看匹配结果，支持 g、i、m、s 等标志与捕获分组。</p>",
	},
	{
		slug: "color",
		name: "颜色转换",
		icon: "🎨",
		category: "设计辅助",
		desc: "HEX、RGB、HSL 三种颜色格式互转，附色板实时预览。",
		content:
			"<p>设计切图与写样式时的常用工具，任意格式输入即可得到其余格式结果，并给出配色预览。</p>",
	},

	/* ---------------------------------------------------------------
	 * 外链工具示例（取消注释即可启用，不会生成 /tools/<slug>/ 页面）
	 * ------------------------------------------------------------ */
	// {
	// 	slug: "example-external",
	// 	name: "示例外链工具",
	// 	icon: "🌐",
	// 	category: "开发工具",
	// 	desc: "这是一个指向外部站点的工具条目示例。",
	// 	url: "https://example.com",
	// },
];
