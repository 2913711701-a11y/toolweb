/**
 * 各页面的 HTML 片段渲染：卡片、筛选条、首页、工具大全、网址导航、工具详情、404。
 */
const { esc, attr, joinUrl, assetUrl, truncate, hostOf, slugify, resolveDownload } = require("./utils");
const { svg } = require("./layout");

/* =====================================================================
 * 复用组件
 * ================================================================== */

/** 工具卡片。 */
function toolCard(tool, base) {
	const external = Boolean(tool.url);
	const href = external ? tool.url : base + "tools/" + tool.slug + "/";
	const target = external ? ' target="_blank" rel="noopener nofollow"' : "";

	return `<a class="tw-card tw-card--tool" href="${attr(href)}"${target}
		data-role="tool-item"
		data-name="${attr(tool.name)}"
		data-cats="${attr(tool.catSlug)}">
		<span class="tw-icon tw-icon--emoji" aria-hidden="true">${esc(tool.icon)}</span>
		<span class="tw-card__body">
			<span class="tw-card__title">${esc(tool.name)}${
		external ? '<span class="tw-card__external" aria-label="外部链接">↗</span>' : ""
	}</span>
			<span class="tw-card__desc">${esc(tool.desc)}</span>
			<span class="tw-card__meta"><span class="tw-tag">${esc(tool.category)}</span>${
		external ? `<span class="tw-card__host">${esc(hostOf(tool.url))}</span>` : ""
	}</span>
		</span>
	</a>`;
}

/** 网址卡片。 */
function siteCard(site) {
	return `<a class="tw-card tw-card--site" href="${attr(site.url)}" target="_blank" rel="noopener nofollow"
		data-role="site-item"
		data-name="${attr(site.name)}"
		data-cats="${attr(site.catSlug)}">
		<span class="tw-icon tw-icon--emoji" aria-hidden="true">${esc(site.icon)}</span>
		<span class="tw-card__body">
			<span class="tw-card__title">${esc(site.name)}</span>
			<span class="tw-card__host">${esc(hostOf(site.url))}</span>
			<span class="tw-card__desc">${esc(site.desc || "")}</span>
		</span>
	</a>`;
}

/** 区块标题。 */
function sectionHead(title, desc, url) {
	return `<div class="tw-section__head">
		<div class="tw-section__titles">
			<h2 class="tw-section__title">${esc(title)}</h2>
			${desc ? `<p class="tw-section__desc">${esc(desc)}</p>` : ""}
		</div>
		${url ? `<a class="tw-section__more" href="${attr(url)}">查看全部<span aria-hidden="true">→</span></a>` : ""}
	</div>`;
}

/** 分类筛选条（纯前端过滤，见 assets/js/main.js 的 initHubFilter）。 */
function filterBar(categories, label) {
	const chips = categories
		.map(
			(item) =>
				`<button type="button" class="tw-chip" data-filter="${attr(item.slug)}">${esc(
					item.name
				)}<span class="tw-chip__count">${item.count}</span></button>`
		)
		.join("");

	return `<div class="tw-filters" data-role="filter-bar">
		<button type="button" class="tw-chip is-active" data-filter="all">${esc(label)}</button>${chips}
	</div>`;
}

/** 面包屑。 */
function breadcrumbs(items) {
	const parts = items
		.map((item, index) => {
			const isLast = index === items.length - 1;
			if (!isLast && item.url) {
				return `<li><a href="${attr(item.url)}">${esc(item.title)}</a><span class="tw-breadcrumb__sep" aria-hidden="true">/</span></li>`;
			}
			return `<li><span aria-current="page">${esc(truncate(item.title, 40))}</span></li>`;
		})
		.join("");

	return `<nav class="tw-breadcrumb" aria-label="面包屑导航"><ol>${parts}</ol></nav>`;
}

/**
 * 聚合页顶部的吸顶工具条：关键词输入 + 分类筛选 + 可选计数。
 *
 * @param {Object} options
 * @param {string} options.id          输入框 id
 * @param {string} options.placeholder 占位文字
 * @param {string} options.filters     已渲染的筛选条 HTML
 * @param {string} [options.countTpl]  计数模板，形如「共 %d 款工具」；留空则不输出计数
 * @param {number} [options.count]     初始计数
 */
function hubBar(options) {
	const count = options.countTpl
		? `<p class="tw-hub__count" data-role="hub-count" data-count-tpl="${attr(options.countTpl)}">${esc(
				options.countTpl.replace("%d", String(options.count))
		  )}</p>`
		: "";

	return `<div class="tw-hub__bar tw-hub__bar--sticky">
		<div class="tw-hub__search">
			<span class="tw-hub__search-icon" aria-hidden="true">${svg("search", 18)}</span>
			<label class="screen-reader-text" for="${attr(options.id)}">筛选</label>
			<input type="search" id="${attr(options.id)}" data-role="hub-search" placeholder="${attr(
		options.placeholder
	)}" autocomplete="off">
		</div>
		${options.filters}
		${count}
	</div>`;
}

/* =====================================================================
 * 首页
 * ================================================================== */
function home(ctx) {
	const { config, base, tools, sites, categories, stats } = ctx;
	const hero = config.hero;
	const homeCfg = config.home;

	const heroTags = ctx.hotTags.length
		? `<div class="tw-hero__tags">
			<span class="tw-hero__tags-label">热门</span>
			${ctx.hotTags
				.map(
					(tag) =>
						`<a class="tw-chip tw-chip--link" href="${attr(
							base + "tools/?q=" + encodeURIComponent(tag)
						)}">${esc(tag)}</a>`
				)
				.join("")}
		</div>`
		: "";

	const heroSearch = hero.showSearch
		? `<div class="tw-hero__searchbox" data-search-root>
			<form class="tw-search tw-search--hero" role="search" action="${attr(base + "tools/")}">
				<span class="tw-search__icon" aria-hidden="true">${svg("search", 20)}</span>
				<label class="screen-reader-text" for="tw-hero-search">搜索工具或网址</label>
				<input type="search" id="tw-hero-search" name="q" autocomplete="off"
					placeholder="${attr(hero.placeholder)}" data-role="live-search">
				<button type="submit" class="tw-btn tw-btn--primary">搜索</button>
			</form>
			<div class="tw-search__results" data-role="search-results" aria-live="polite"></div>
		</div>`
		: "";

	const heroHtml = `<section class="tw-hero">
	<div class="tw-container tw-hero__inner">
		${hero.title ? `<h1 class="tw-hero__title">${esc(hero.title)}</h1>` : ""}
		${hero.subtitle ? `<p class="tw-hero__desc">${esc(hero.subtitle)}</p>` : ""}
		${heroSearch}
		${heroTags}
		<div class="tw-hero__stats">
			<span class="tw-hero__stat"><strong>${stats.toolCount}</strong> 款在线工具</span>
			<span class="tw-hero__stat"><strong>${stats.siteCount}</strong> 个优质站点</span>
			<span class="tw-hero__stat"><strong>100%</strong> 本地运行、不上传数据</span>
		</div>
	</div>
</section>`;

	const sections = [];

	/* ---- 推荐工具 ---- */
	if (homeCfg.showFeaturedTools) {
		const featured = tools.filter((tool) => tool.featured && !tool.url);
		const list = (featured.length ? featured : tools.filter((tool) => !tool.url)).slice(
			0,
			homeCfg.featuredToolsCount
		);
		if (list.length) {
			sections.push(`<section class="tw-section">
	<div class="tw-container">
		${sectionHead("推荐工具", "打开即用，全部在浏览器本地完成计算", base + "tools/")}
		<div class="tw-grid tw-grid--tools">${list.map((tool) => toolCard(tool, base)).join("")}</div>
	</div>
</section>`);
		}
	}

	/* ---- 按分类浏览 ---- */
	if (homeCfg.showCategorySections) {
		categories.tools.slice(0, homeCfg.categorySectionCount).forEach((category) => {
			const list = tools
				.filter((tool) => tool.catSlug === category.slug && !tool.url)
				.slice(0, homeCfg.categorySectionTools);
			if (!list.length) {
				return;
			}
			sections.push(`<section class="tw-section tw-section--alt">
	<div class="tw-container">
		${sectionHead(category.name, `共 ${category.count} 款工具`, base + "tools/")}
		<div class="tw-grid tw-grid--tools">${list.map((tool) => toolCard(tool, base)).join("")}</div>
	</div>
</section>`);
		});
	}

	/* ---- 精选网址 ---- */
	if (homeCfg.showHomeSites) {
		const list = sites.slice(0, homeCfg.homeSitesCount);
		if (list.length) {
			sections.push(`<section class="tw-section">
	<div class="tw-container">
		${sectionHead("精选网址", "按分类整理的常用站点，点击直达", base + "sites/")}
		<div class="tw-grid tw-grid--sites">${list.map((site) => siteCard(site)).join("")}</div>
	</div>
</section>`);
		}
	}

	const jsonLd = config.seo.jsonLd
		? {
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "WebSite",
						"@id": joinUrl(config.site.url, "/#website"),
						url: joinUrl(config.site.url, "/"),
						name: config.site.name,
						description: config.site.description,
						inLanguage: config.site.lang,
						potentialAction: {
							"@type": "SearchAction",
							target: {
								"@type": "EntryPoint",
								urlTemplate: joinUrl(config.site.url, "tools/?q={search_term_string}"),
							},
							"query-input": "required name=search_term_string",
						},
					},
				],
		  }
		: null;

	return {
		title: "",
		description: config.site.description,
		path: "",
		nav: "home",
		jsonLd,
		body: heroHtml + sections.join("\n"),
	};
}

/* =====================================================================
 * 工具大全
 * ================================================================== */
function toolsHub(ctx) {
	const { config, base, tools, categories, stats } = ctx;

	const cards = tools.map((tool) => toolCard(tool, base)).join("");

	const jsonLd = config.seo.jsonLd
		? {
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "CollectionPage",
						name: "工具大全",
						url: joinUrl(config.site.url, "tools/"),
						description: `共收录 ${stats.toolCount} 款在线工具。`,
					},
					{
						"@type": "BreadcrumbList",
						itemListElement: [
							{ "@type": "ListItem", position: 1, name: "首页", item: joinUrl(config.site.url, "/") },
							{ "@type": "ListItem", position: 2, name: "工具大全", item: joinUrl(config.site.url, "tools/") },
						],
					},
				],
		  }
		: null;

	return {
		title: "工具大全",
		description: `共收录 ${stats.toolCount} 款常用在线工具，全部在浏览器本地运行，不上传任何数据。`,
		path: "tools/",
		nav: "tools",
		jsonLd,
		body: `<div class="tw-container">
	${breadcrumbs([
		{ title: "首页", url: base },
		{ title: "工具大全" },
	])}

	<header class="tw-page-head">
		<h1 class="tw-page-head__title">工具大全</h1>
		<p class="tw-page-head__desc">全部工具均可在浏览器本地运行，不上传任何数据。</p>
	</header>

	<div class="tw-hub" data-hub="tools">
		${hubBar({
			id: "tw-hub-search",
			placeholder: "输入工具名称或用途筛选…",
			filters: filterBar(categories.tools, "全部"),
			countTpl: "共 %d 款工具",
			count: stats.toolCount,
		})}

		<div class="tw-grid tw-grid--tools">${cards}</div>
		<p class="tw-hub__empty" data-role="hub-empty" hidden>没有匹配的工具，换个关键词试试。</p>
	</div>
</div>`,
	};
}

/* =====================================================================
 * 网址导航
 * ================================================================== */
function sitesHub(ctx) {
	const { config, base, sites, categories, stats } = ctx;

	const groups = categories.sites
		.map((category) => {
			const list = sites.filter((site) => site.catSlug === category.slug);
			if (!list.length) {
				return "";
			}
			return `<section class="tw-site-group" data-role="site-group">
		<h2 class="tw-site-group__title">
			<span class="tw-site-group__dot" aria-hidden="true"></span>
			${esc(category.name)}
			<span class="tw-site-group__count">${list.length}</span>
		</h2>
		<div class="tw-grid tw-grid--sites">${list.map((site) => siteCard(site)).join("")}</div>
	</section>`;
		})
		.filter(Boolean)
		.join("\n");

	const jsonLd = config.seo.jsonLd
		? {
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "CollectionPage",
						name: "网址导航",
						url: joinUrl(config.site.url, "sites/"),
						description: `共收录 ${stats.siteCount} 个优质站点。`,
					},
					{
						"@type": "BreadcrumbList",
						itemListElement: [
							{ "@type": "ListItem", position: 1, name: "首页", item: joinUrl(config.site.url, "/") },
							{ "@type": "ListItem", position: 2, name: "网址导航", item: joinUrl(config.site.url, "sites/") },
						],
					},
				],
		  }
		: null;

	return {
		title: "网址导航",
		description: `按分类整理的 ${stats.siteCount} 个常用站点，点击卡片直接访问。`,
		path: "sites/",
		nav: "sites",
		jsonLd,
		body: `<div class="tw-container">
	${breadcrumbs([{ title: "首页", url: base }, { title: "网址导航" }])}

	<header class="tw-page-head">
		<h1 class="tw-page-head__title">网址导航</h1>
		<p class="tw-page-head__desc">按分类整理的常用站点，点击卡片直接访问。</p>
	</header>

	<div class="tw-hub" data-hub="sites">
		${hubBar({
			id: "tw-hub-site-search",
			placeholder: "输入网站名称筛选…",
			filters: filterBar(categories.sites, "全部"),
		})}

		${groups || '<p class="tw-hub__empty">还没有收录网址。</p>'}
		<p class="tw-hub__empty" data-role="hub-empty" hidden>没有匹配的网址，换个关键词试试。</p>
	</div>
</div>`,
	};
}

/* =====================================================================
 * 工具详情
 * ================================================================== */
function toolDetail(ctx, tool) {
	const { config, base, tools } = ctx;

	const related = tools
		.filter((item) => !item.url && item.slug !== tool.slug && item.category === tool.category)
		.slice(0, 6);
	const fallback = related.length
		? related
		: tools.filter((item) => !item.url && item.slug !== tool.slug).slice(0, 6);

	// 下载按钮：链接来自工具自身的 download 或全局 toolDownload.url，都没有就不渲染。
	// 复用 tw-btn 样式（不新增 CSS 类），data-role 供测试与断链检查识别。
	const download = resolveDownload(config, tool);
	const downloadBtn = download
		? `<a class="tw-btn tw-btn--primary tw-btn--sm" data-role="tool-download" href="${attr(
				download.url
		  )}"${download.saveAs ? " download" : ""}${
				download.newTab ? ' target="_blank" rel="noopener"' : ""
		  }${download.note ? ` title="${attr(download.note)}"` : ""}>${svg("download", 15)}${esc(
				download.label
		  )}</a>`
		: "";

	const app = `<section class="tw-tool" data-role="tool-app" data-tool="${attr(
		tool.slug
	)}" data-tool-name="${attr(tool.name)}">
	<div class="tw-tool__head">
		<span class="tw-tool__pill"><span class="tw-tool__dot" aria-hidden="true"></span>本地运行 · 数据不上传</span>
		<div class="tw-tool__head-actions">${downloadBtn}
			<button type="button" class="tw-btn tw-btn--ghost tw-btn--sm" data-role="tool-reset">重置</button>
		</div>
	</div>
	<div class="tw-tool__body" data-role="tool-body">
		<div class="tw-tool__loading">工具加载中…</div>
	</div>
	<noscript><p class="tw-tool__notice">该工具需要启用 JavaScript 才能使用。</p></noscript>
</section>`;

	const jsonLd = config.seo.jsonLd
		? {
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "SoftwareApplication",
						name: tool.name,
						url: joinUrl(config.site.url, "tools/" + tool.slug + "/"),
						applicationCategory: "UtilitiesApplication",
						operatingSystem: "Web",
						description: tool.desc,
						offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
					},
					{
						"@type": "BreadcrumbList",
						itemListElement: [
							{ "@type": "ListItem", position: 1, name: "首页", item: joinUrl(config.site.url, "/") },
							{ "@type": "ListItem", position: 2, name: "工具大全", item: joinUrl(config.site.url, "tools/") },
							{
								"@type": "ListItem",
								position: 3,
								name: tool.name,
								item: joinUrl(config.site.url, "tools/" + tool.slug + "/"),
							},
						],
					},
				],
		  }
		: null;

	return {
		title: tool.name,
		description: tool.desc,
		path: "tools/" + tool.slug + "/",
		nav: "tools",
		jsonLd,
		extraScripts: `<script src="${attr(
			assetUrl(base, "assets/js/tools.js", ctx.assetVersion)
		)}" defer></script>`,
		body: `<div class="tw-container tw-layout tw-no-sidebar">
	<div class="tw-layout__main">
		${breadcrumbs([
			{ title: "首页", url: base },
			{ title: "工具大全", url: base + "tools/" },
			{ title: tool.name },
		])}

		<article class="tw-tool-page">
			<header class="tw-tool-page__head">
				<span class="tw-icon tw-icon--emoji tw-icon--lg" aria-hidden="true">${esc(tool.icon)}</span>
				<div class="tw-tool-page__intro">
					<h1 class="tw-tool-page__title">${esc(tool.name)}${
			tool.badge ? `<span class="tw-badge">${esc(tool.badge)}</span>` : ""
		}</h1>
					<p class="tw-tool-page__desc">${esc(tool.desc)}</p>
					<div class="tw-tool-page__tags">
						<a class="tw-chip tw-chip--link" href="${attr(base + "tools/")}#cat-${attr(
			tool.catSlug
		)}">${esc(tool.category)}</a>
					</div>
				</div>
			</header>

			${
				tool.url
					? `<section class="tw-external">
				<p class="tw-external__host">${esc(hostOf(tool.url))}</p>
				<p class="tw-external__desc">该工具由外部站点提供，点击下方按钮前往使用。</p>
				<a class="tw-btn tw-btn--primary tw-btn--lg" href="${attr(
					tool.url
				)}" target="_blank" rel="noopener nofollow">前往使用 ↗</a>
			</section>`
					: app
			}

			${tool.content ? `<div class="tw-entry__content">${tool.content}</div>` : ""}
		</article>

		${
			fallback.length
				? `<section class="tw-section tw-section--inline">
			${sectionHead("相关工具", "", base + "tools/")}
			<div class="tw-grid tw-grid--tools">${fallback.map((item) => toolCard(item, base)).join("")}</div>
		</section>`
				: ""
		}
	</div>
</div>`,
	};
}

/* =====================================================================
 * 404
 * ================================================================== */
function notFound(ctx) {
	const { config, base, tools } = ctx;
	const hot = tools.filter((tool) => !tool.url).slice(0, 6);

	return {
		title: "页面不存在",
		description: "抱歉，你访问的页面不存在或已被移动。",
		path: "404.html",
		nav: "",
		noIndex: true,
		jsonLd: null,
		body: `<div class="tw-container">
	<div class="tw-404">
		<p class="tw-404__code">404</p>
		<h1 class="tw-404__title">页面不存在</h1>
		<p class="tw-404__desc">你访问的页面可能已被移动或删除，试试从下面的入口继续。</p>

		<form class="tw-search tw-search--inline" role="search" action="${attr(base + "tools/")}">
			<span class="tw-search__icon" aria-hidden="true">${svg("search", 20)}</span>
			<label class="screen-reader-text" for="tw-404-search">搜索工具</label>
			<input type="search" id="tw-404-search" name="q" placeholder="搜索工具或网址…" autocomplete="off">
			<button type="submit" class="tw-btn tw-btn--primary">搜索</button>
		</form>

		<div class="tw-404__links">
			<a class="tw-btn tw-btn--ghost" href="${attr(base)}">返回首页</a>
			<a class="tw-btn tw-btn--ghost" href="${attr(base + "tools/")}">工具大全</a>
			<a class="tw-btn tw-btn--ghost" href="${attr(base + "sites/")}">网址导航</a>
		</div>

		<p class="tw-404__hot-label">热门工具</p>
		<div class="tw-404__hot">
			<div class="tw-chips tw-chips--wrap">
				${hot
					.map(
						(tool) =>
							`<a class="tw-chip tw-chip--link" href="${attr(base + "tools/" + tool.slug + "/")}">${esc(
								tool.name
							)}</a>`
					)
					.join("")}
			</div>
		</div>
	</div>
</div>`,
	};
}

module.exports = {
	toolCard,
	siteCard,
	sectionHead,
	filterBar,
	breadcrumbs,
	home,
	toolsHub,
	sitesHub,
	toolDetail,
	notFound,
};
