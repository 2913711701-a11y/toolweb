/**
 * 页面骨架与全站共享片段：<head> / 页头 / 抽屉 / 搜索面板 / 页脚。
 * 所有页面都由 renderDocument() 包裹，保证结构一致。
 */
const { esc, attr, joinUrl, assetUrl, hexToRgb, lighten, clamp } = require("./utils");

/* =====================================================================
 * 内联 SVG 图标
 * ================================================================== */
const ICONS = {
	search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
	menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
	sun:
		'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
	moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
	"arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
	copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
	star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
	grid:
		'<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
	download: '<path d="M12 4v11M7.5 10.5l4.5 4.5 4.5-4.5M4.5 20h15"/>',
};

/** 输出一个内联 SVG 图标。 */
function svg(name, size = 20) {
	const path = ICONS[name];
	if (!path) {
		return "";
	}
	return (
		`<svg class="tw-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
		`stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
		`aria-hidden="true" focusable="false">${path}</svg>`
	);
}

/* =====================================================================
 * 动态 CSS 变量（替代原主题「定制器 → 内联样式」）
 * ================================================================== */
function buildDynamicCss(config) {
	const appearance = config.appearance || {};
	const primary = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(appearance.primaryColor || "")
		? appearance.primaryColor
		: "#2563eb";
	const radius = clamp(appearance.radius, 0, 32) || 14;
	const width = clamp(appearance.containerWidth, 960, 1600) || 1200;
	const rgb = hexToRgb(primary);

	return (
		`:root{--tw-primary:${primary};--tw-primary-rgb:${rgb};` +
		`--tw-primary-soft:rgba(${rgb}, .10);--tw-primary-ring:rgba(${rgb}, .28);` +
		`--tw-radius:${radius}px;--tw-radius-sm:${Math.max(4, radius - 4)}px;` +
		`--tw-radius-lg:${radius + 8}px;--tw-container:${width}px;}` +
		`[data-theme="dark"]{--tw-primary:${lighten(primary, 0.18)};` +
		`--tw-primary-soft:rgba(${rgb}, .16);--tw-primary-ring:rgba(${rgb}, .35);}`
	);
}

/* =====================================================================
 * <head>
 * ================================================================== */
function renderHead(page, ctx) {
	const { config, base, assetVersion } = ctx;
	const site = config.site;
	const seo = config.seo || {};
	const fullTitle = page.title
		? `${page.title} - ${site.name}`
		: `${site.name} - ${site.tagline || site.description}`;
	const description = page.description || site.description || "";
	const canonical = joinUrl(site.url, page.path);

	const blocks = [
		'<meta charset="UTF-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
		`<title>${esc(fullTitle)}</title>`,
	];

	if (description) {
		blocks.push(`<meta name="description" content="${attr(description)}">`);
	}

	blocks.push(
		`<meta name="theme-color" content="${attr(config.appearance.primaryColor)}" media="(prefers-color-scheme: light)">`,
		`<meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">`,
		`<link rel="canonical" href="${attr(canonical)}">`,
		`<link rel="icon" href="${attr(assetUrl(base, "assets/favicon.svg", assetVersion))}" type="image/svg+xml">`,
		`<link rel="stylesheet" href="${attr(assetUrl(base, "assets/css/main.css", assetVersion))}">`
	);

	// 首屏无闪烁：主题必须在样式表之后、body 之前确定。
	if (page.noIndex) {
		blocks.push('<meta name="robots" content="noindex, follow">');
	}

	// 主题初始化（避免闪白 / 闪黑）。
	const mode = ["auto", "light", "dark"].includes(config.appearance.defaultMode)
		? config.appearance.defaultMode
		: "auto";
	blocks.push(
		`<style>${buildDynamicCss(config)}</style>`,
		"<script>try{var m=localStorage.getItem('toolweb-theme');" +
			`if(!m){var d='${mode}';m='auto'===d?(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):d;}` +
			"document.documentElement.setAttribute('data-theme',m);}catch(e){}</script>"
	);

	if (seo.enabled) {
		blocks.push(
			`<meta property="og:site_name" content="${attr(site.name)}">`,
			`<meta property="og:type" content="website">`,
			`<meta property="og:title" content="${attr(fullTitle)}">`,
			`<meta property="og:url" content="${attr(canonical)}">`,
			`<meta property="og:locale" content="${attr(String(site.lang || "zh-CN").replace("-", "_"))}">`
		);
		if (description) {
			blocks.push(`<meta property="og:description" content="${attr(description)}">`);
		}
		if (seo.ogImage) {
			blocks.push(
				`<meta property="og:image" content="${attr(seo.ogImage)}">`,
				'<meta name="twitter:card" content="summary_large_image">'
			);
		} else if (seo.twitter) {
			blocks.push('<meta name="twitter:card" content="summary">');
		}
		if (seo.twitter) {
			blocks.push(
				`<meta name="twitter:title" content="${attr(fullTitle)}">`,
				description ? `<meta name="twitter:description" content="${attr(description)}">` : ""
			);
		}
		if (seo.jsonLd && page.jsonLd) {
			blocks.push(
				`<script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>`
			);
		}
	}

	if (config.code && config.code.head) {
		blocks.push(config.code.head);
	}

	return blocks.filter(Boolean).join("\n");
}

/* =====================================================================
 * 页头 + 抽屉 + 搜索面板
 * ================================================================== */
const NAV = [
	{ key: "home", label: "首页", path: "" },
	{ key: "tools", label: "工具大全", path: "tools/" },
	{ key: "sites", label: "网址导航", path: "sites/" },
];

function renderHeader(page, ctx) {
	const { config, base } = ctx;
	const site = config.site;
	const initial = site.brandInitial || (site.name || "T").slice(0, 1);

	const navItems = NAV.map((item) => {
		const current = item.key === page.nav;
		return (
			`<li${current ? ' class="is-current"' : ""}>` +
			`<a href="${attr(base + item.path)}"${current ? ' aria-current="page"' : ""}>${esc(item.label)}</a></li>`
		);
	}).join("");

	const nav = `<ul class="tw-nav__list">${navItems}</ul>`;
	const drawerNav = `<ul class="tw-drawer__list">${navItems}</ul>`;

	const catList = ctx.categories.tools
		.map(
			(item) =>
				`<a class="tw-chip tw-chip--link" href="${attr(base + "tools/")}#cat-${attr(item.slug)}">${esc(
					item.name
				)}</a>`
		)
		.join("");

	return `<header class="tw-header" id="tw-header">
	<div class="tw-container tw-header__inner">
		<div class="tw-brand">
			<a class="tw-brand__link" href="${attr(base)}" rel="home">
				<span class="tw-brand__mark" aria-hidden="true">${esc(initial)}</span>
				<span class="tw-brand__text">
					<span class="tw-brand__name">${esc(site.name)}</span>
					${site.tagline ? `<span class="tw-brand__tagline">${esc(site.tagline)}</span>` : ""}
				</span>
			</a>
		</div>

		<nav class="tw-nav" aria-label="主导航">${nav}</nav>

		<div class="tw-actions">
			<button type="button" class="tw-icon-btn" data-action="search" aria-label="打开搜索" aria-expanded="false">${svg(
				"search",
				19
			)}</button>
			<button type="button" class="tw-icon-btn tw-theme-btn" data-action="theme" aria-label="切换深浅色">
				<span class="tw-theme-btn__light">${svg("moon", 19)}</span>
				<span class="tw-theme-btn__dark">${svg("sun", 19)}</span>
			</button>
			<button type="button" class="tw-icon-btn tw-menu-btn" data-action="drawer" aria-label="打开菜单" aria-expanded="false" aria-controls="tw-drawer">
				<span class="tw-menu-btn__open">${svg("menu", 20)}</span>
				<span class="tw-menu-btn__close">${svg("close", 20)}</span>
			</button>
		</div>
	</div>
</header>

<div class="tw-drawer" id="tw-drawer" hidden>
	<div class="tw-drawer__panel">
		<form class="tw-drawer__search" role="search" action="${attr(base + "tools/")}">
			<label class="screen-reader-text" for="tw-drawer-s">搜索</label>
			<input type="search" id="tw-drawer-s" name="q" placeholder="搜索工具或网址…" autocomplete="off">
			<button type="submit" class="tw-btn tw-btn--primary tw-btn--block">搜索</button>
		</form>

		<nav class="tw-drawer__nav" aria-label="移动端导航">${drawerNav}</nav>

		<div class="tw-drawer__cats">
			<p class="tw-drawer__label">工具分类</p>
			<div class="tw-chips tw-chips--wrap">${catList}</div>
		</div>
	</div>
	<button type="button" class="tw-drawer__backdrop" data-action="drawer" aria-label="关闭菜单"></button>
</div>

<div class="tw-searchbox" id="tw-searchbox" hidden>
	<div class="tw-searchbox__backdrop" data-action="search"></div>
	<div class="tw-searchbox__panel" role="dialog" aria-modal="true" aria-label="站内搜索">
		<form class="tw-searchbox__form" role="search" action="${attr(base + "tools/")}">
			<span class="tw-searchbox__icon" aria-hidden="true">${svg("search", 20)}</span>
			<label class="screen-reader-text" for="tw-live-search">搜索工具或网址</label>
			<input type="search" id="tw-live-search" name="q" autocomplete="off"
				placeholder="${attr(config.hero.placeholder || "搜索工具、网址…")}" data-role="live-search">
			<button type="submit" class="tw-btn tw-btn--primary tw-btn--sm">搜索</button>
		</form>

		<div class="tw-searchbox__results" data-search-root>
			<div class="tw-search__results" data-role="search-results" aria-live="polite"></div>
		</div>

		${
			ctx.hotTags.length
				? `<div class="tw-searchbox__tags">
			<span class="tw-searchbox__tags-label">热门搜索</span>
			${ctx.hotTags
				.map(
					(tag) =>
						`<a class="tw-chip tw-chip--link" href="${attr(base + "tools/?q=" + encodeURIComponent(tag))}">${esc(
							tag
						)}</a>`
				)
				.join("")}
		</div>`
				: ""
		}
	</div>
</div>

<main id="tw-content" class="tw-main">`;
}

/* =====================================================================
 * 页脚
 * ================================================================== */
function renderFooter(page, ctx) {
	const { config, base } = ctx;
	const footer = config.footer || {};
	const year = new Date().getFullYear();
	const copyright = footer.copyright || `© ${year} ${config.site.name}. 保留所有权利。`;

	// 备案号是可选内容（多数站点留空），没有就不输出空的 <p>。
	const icp = footer.icp
		? `<a class="tw-footer__icp" href="${attr(
				footer.icpHref || "https://beian.miit.gov.cn/"
		  )}" target="_blank" rel="noopener nofollow">${esc(footer.icp)}</a>`
		: "";

	return `</main><!-- #tw-content -->

<footer class="tw-footer">
	<div class="tw-container">
		<div class="tw-footer__bottom">
			<p class="tw-footer__copy">${esc(copyright)}</p>${
		icp ? `\n\t\t\t<p class="tw-footer__meta">${icp}</p>` : ""
	}
		</div>
	</div>
</footer>

<button type="button" class="tw-totop" data-action="totop" aria-label="返回顶部" hidden>${svg(
		"arrow-up",
		20
	)}</button>

<div class="tw-toast" role="status" aria-live="polite"></div>

<script src="${attr(assetUrl(base, "assets/js/main.js", ctx.assetVersion))}" defer></script>
${page.extraScripts || ""}
${config.code && config.code.footer ? config.code.footer : ""}
</body>
</html>
`;
}

/* =====================================================================
 * 完整文档
 * ================================================================== */
function renderDocument(page, ctx) {
	const { config } = ctx;
	return `<!DOCTYPE html>
<html lang="${attr(config.site.lang || "zh-CN")}">
<head>
${renderHead(page, ctx)}
</head>
<body class="tw-ready">
<a class="tw-skip-link" href="#tw-content">跳到主要内容</a>
${renderHeader(page, ctx)}
${page.body}
${renderFooter(page, ctx)}`;
}

module.exports = { svg, renderDocument, buildDynamicCss, NAV };
