/**
 * 构建期通用小工具。
 */

/** HTML 文本转义（用于插入到文本节点或属性中）。 */
function esc(value) {
	return String(value === null || value === undefined ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** 属性值转义（等价于 esc，语义更清晰）。 */
const attr = esc;

/** 把任意字符串变成 URL 安全的 slug。 */
function slugify(text) {
	return String(text)
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** 拼接 URL，避免出现重复斜杠。 */
function joinUrl(base, path) {
	const left = String(base || "").replace(/\/+$/, "");
	const right = String(path || "").replace(/^\/+/, "");
	return right ? left + "/" + right : left + "/";
}

/**
 * 给静态资源 URL 附加内容哈希版本号：`/assets/css/main.css?v=ab12cd34`
 *
 * 为什么必须有：`_headers` 把 `/assets/*` 设成 `max-age=31536000, immutable`，
 * 浏览器一年内不会回源。如果 URL 里不带版本号，改了 CSS/JS 老访客会一直用缓存里的旧文件
 * —— 「修了但用户看不到」。内容一变哈希就变，URL 随之改变，才能正确绕开 immutable 缓存。
 */
function assetUrl(base, assetPath, version) {
	const url = base + assetPath;
	return version ? url + "?v=" + version : url;
}

/** 按字数截断，超出补省略号。 */
function truncate(text, max) {
	const value = String(text || "").replace(/\s+/g, " ").trim();
	if (value.length <= max) {
		return value;
	}
	return value.slice(0, max - 1) + "…";
}

/** 去掉 HTML 标签，得到纯文本。 */
function stripTags(html) {
	return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** 从 URL 中取出不含 www. 的主机名。 */
function hostOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./i, "");
	} catch (error) {
		return "";
	}
}

/** 把 #RRGGBB 转成 "r, g, b"。 */
function hexToRgb(hex) {
	let value = String(hex || "").replace(/^#/, "");
	if (value.length === 3) {
		value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
	}
	if (!/^[0-9a-f]{6}$/i.test(value)) {
		return "37, 99, 235";
	}
	return [
		parseInt(value.slice(0, 2), 16),
		parseInt(value.slice(2, 4), 16),
		parseInt(value.slice(4, 6), 16),
	].join(", ");
}

/** 把颜色按比例向白色混合，得到深色模式下更亮的主色。 */
function lighten(hex, ratio) {
	let value = String(hex || "").replace(/^#/, "");
	if (value.length === 3) {
		value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
	}
	if (!/^[0-9a-f]{6}$/i.test(value)) {
		return "#4f83f1";
	}
	const parts = [0, 2, 4].map((offset) => {
		const channel = parseInt(value.slice(offset, offset + 2), 16);
		const mixed = Math.round(channel + (255 - channel) * ratio);
		return Math.max(0, Math.min(255, mixed)).toString(16).padStart(2, "0");
	});
	return "#" + parts.join("");
}

/** 把数值限制在区间内。 */
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, Number(value) || 0));
}

/**
 * 解析某个工具详情页的「下载」按钮配置。
 *
 * 优先级：工具自身的 `download` > 全局 `config.toolDownload`。
 * 两处都没给出可用链接时返回 null —— 页面干脆不渲染按钮，
 * 免得出现一个点了没反应的死按钮（有链接才显示，是这个特性的核心约定）。
 *
 * `content/tools.js` 里支持三种写法：
 *   download: "https://…/x.zip"                      // 简写，直接用链接
 *   download: { url, label, note, newTab, saveAs }   // 细粒度覆盖全局
 *   download: false                                  // 这个工具单独不显示
 *
 * URL 里可用占位符 `{slug}` / `{name}` / `{category}`，
 * 其中 name / category 会做 URL 编码（它们是中文）。
 */
function resolveDownload(config, tool) {
	const global = config.toolDownload || {};
	if (global.enabled === false) {
		return null;
	}

	const own = tool.download;
	if (own === false) {
		return null;
	}
	const ownObj = own && typeof own === "object" ? own : {};

	const rawUrl = (typeof own === "string" ? own : ownObj.url) || global.url || "";
	if (!rawUrl) {
		return null;
	}

	const tokens = {
		slug: String(tool.slug || ""),
		name: String(tool.name || ""),
		category: String(tool.category || ""),
	};
	const url = String(rawUrl).replace(/\{(slug|name|category)\}/g, (whole, key) =>
		key === "slug" ? tokens.slug : encodeURIComponent(tokens[key])
	);

	// 布尔项用「工具级显式设置 > 全局」的规则，注意不能写成 `||`：
	// 工具级写 false 就是要关掉全局的 true。
	const pick = (key) => (typeof ownObj[key] === "boolean" ? ownObj[key] : Boolean(global[key]));

	return {
		url,
		label: ownObj.label || global.label || "下载",
		note: ownObj.note || global.note || "",
		newTab: pick("newTab"),
		saveAs: pick("saveAs"),
	};
}

module.exports = {
	esc,
	attr,
	slugify,
	joinUrl,
	assetUrl,
	truncate,
	stripTags,
	hostOf,
	hexToRgb,
	lighten,
	clamp,
	resolveDownload,
};
