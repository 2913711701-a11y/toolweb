#!/usr/bin/env node
/**
 * ToolWeb 静态站构建脚本。
 *
 * 用法：  node build.js
 * 产物：  dist/   ← 把整个 dist 目录部署到 Cloudflare Pages 即可
 *
 * 零第三方依赖，只需要 Node 18+。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const config = require("./site.config");
const rawTools = require("./content/tools");
const rawSites = require("./content/sites");

const { esc, slugify, joinUrl, truncate, stripTags, clamp, resolveDownload } = require("./src/utils");
const { renderDocument } = require("./src/layout");
const pages = require("./src/pages");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const ASSETS = path.join(ROOT, "assets");

/* =====================================================================
 * 1. 数据整理
 * ================================================================== */

/** 归一化工具数据，顺便做必填校验。 */
function normalizeTools() {
	const seen = new Set();

	return rawTools.map((tool, index) => {
		const slug = slugify(tool.slug || tool.name);
		if (!slug) {
			throw new Error(`第 ${index + 1} 个工具缺少可用的 slug，请检查 content/tools.js`);
		}
		if (seen.has(slug)) {
			throw new Error(`工具 slug 重复：${slug}`);
		}
		seen.add(slug);

		if (!tool.name || !tool.category) {
			throw new Error(`工具「${slug}」缺少 name 或 category`);
		}

		return {
			slug,
			name: String(tool.name),
			icon: tool.icon || "🧰",
			category: String(tool.category),
			catSlug: slugify(tool.category),
			desc: String(tool.desc || ""),
			badge: tool.badge || "",
			featured: tool.featured !== false,
			content: tool.content || "",
			url: tool.url || "",
			// 详情页下载按钮：字符串=链接，对象=细粒度覆盖，false=该工具不显示，留空=用全局配置。
			// ⚠ 这里不能漏 —— 本函数是字段白名单，没列出的字段会被静默丢掉。
			download: tool.download === undefined ? "" : tool.download,
		};
	});
}

/** 归一化网址数据。 */
function normalizeSites() {
	return rawSites.map((site, index) => {
		if (!site.name || !site.url) {
			throw new Error(`第 ${index + 1} 个网址缺少 name 或 url，请检查 content/sites.js`);
		}
		if (!/^https?:\/\//i.test(site.url)) {
			throw new Error(`网址「${site.name}」的 url 必须以 http:// 或 https:// 开头`);
		}

		return {
			name: String(site.name),
			url: String(site.url),
			icon: site.icon || "🔖",
			category: String(site.category),
			catSlug: slugify(site.category),
			desc: String(site.desc || ""),
			featured: site.featured !== false,
		};
	});
}

/** 按出现顺序归组分类，并按条目数倒序排列（与前端筛选条一致）。 */
function buildCategories(items) {
	const map = new Map();

	items.forEach((item) => {
		if (!map.has(item.catSlug)) {
			map.set(item.catSlug, { slug: item.catSlug, name: item.category, count: 0 });
		}
		map.get(item.catSlug).count += 1;
	});

	return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * 校验 assets/js/tools.js 是否实现了全部内置工具。
 * 这是把「slug 与 JS 实现一一对应」这条约定变成构建期硬校验。
 */
function verifyToolImplementations(tools) {
	const source = fs.readFileSync(path.join(ASSETS, "js", "tools.js"), "utf8");
	const implemented = new Set();
	const pattern = /registry\.([A-Za-z0-9_-]+)\s*=/g;
	let match;

	while ((match = pattern.exec(source)) !== null) {
		implemented.add(match[1]);
	}

	const missing = tools.filter((tool) => !tool.url && !implemented.has(tool.slug)).map((tool) => tool.slug);
	const orphan = Array.from(implemented).filter((key) => !tools.some((tool) => tool.slug === key));

	return { missing, orphan, implemented };
}

/* =====================================================================
 * 2. 写文件
 * ================================================================== */

const written = [];

function writeFile(relativePath, content) {
	const target = path.join(DIST, relativePath);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, content, "utf8");
	written.push({ path: relativePath, size: Buffer.byteLength(content, "utf8") });
}

function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true });
	fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
		const source = path.join(from, entry.name);
		const target = path.join(to, entry.name);
		if (entry.isDirectory()) {
			copyDir(source, target);
		} else {
			fs.copyFileSync(source, target);
			written.push({ path: path.relative(DIST, target), size: fs.statSync(target).size });
		}
	});
}

/* =====================================================================
 * 3. 附带产物与资源版本号
 * ================================================================== */

function renderFavicon() {
	const initial = (config.site.brandInitial || config.site.name || "T").slice(0, 1);
	const color = config.appearance.primaryColor || "#2563eb";

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<rect width="64" height="64" rx="14" fill="${esc(color)}"/>
	<text x="32" y="43" font-family="-apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif"
		font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(initial)}</text>
</svg>
`;
}

function renderSearchIndex(tools, sites) {
	const payload = {
		tools: tools
			.filter((tool) => !tool.url)
			.map((tool) => ({
				t: tool.name,
				u: joinUrl(config.site.url, "tools/" + tool.slug + "/").replace(/^https?:\/\/[^/]+/, ""),
				d: tool.desc,
				c: tool.category,
				k: "工具",
			}))
			.concat(
				tools
					.filter((tool) => tool.url)
					.map((tool) => ({
						t: tool.name,
						u: tool.url,
						d: tool.desc,
						c: tool.category,
						k: "外链工具",
					}))
			),
		sites: sites.map((site) => ({
			t: site.name,
			u: site.url,
			d: site.desc,
			c: site.category,
			k: "网址",
		})),
	};

	return `window.TW_INDEX=${JSON.stringify(payload)};\n`;
}

function renderSitemap(urls) {
	const today = new Date().toISOString().slice(0, 10);
	const entries = urls
		.map(
			(item) => `	<url>
		<loc>${esc(item.loc)}</loc>
		<lastmod>${today}</lastmod>
		<changefreq>${item.changefreq}</changefreq>
		<priority>${item.priority}</priority>
	</url>`
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function renderRobots() {
	return `User-agent: *
Allow: /

Sitemap: ${joinUrl(config.site.url, "sitemap.xml")}
`;
}

/** Cloudflare Pages 的 _headers 文件：安全响应头 + 缓存策略。 */
function renderHeaders() {
	return `/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
`;
}

/**
 * 由静态资源的实际内容算出一个短哈希，作为 URL 版本号（`main.css?v=ab12cd34`）。
 *
 * 为什么必须有：`_headers` 把 `/assets/*` 设成 immutable 一年，浏览器期间不会回源。
 * URL 里不带版本号的话，改了 CSS/JS 老访客会一直吃缓存里的旧文件 ——「修了但用户看不到」。
 *
 * 为什么不逐个文件算：整站资源才 350 KB，任何一个文件变了就让全部资源 URL 一起变，
 * 实现简单、不会漏，代价可以忽略。
 */
function hashAssets(parts) {
	const hash = crypto.createHash("sha256");
	parts.forEach((part) => hash.update(part));
	return hash.digest("hex").slice(0, 8);
}

/* =====================================================================
 * 4. 主流程
 * ================================================================== */
function main() {
	const tools = normalizeTools();
	const sites = normalizeSites();

	const check = verifyToolImplementations(tools);
	if (check.missing.length) {
		console.error("\n✖ 以下内置工具在 assets/js/tools.js 中找不到实现：");
		check.missing.forEach((slug) => console.error("   - registry." + slug));
		console.error("  请在 assets/js/tools.js 里补上同名实现，或在 content/tools.js 中删掉该条目。\n");
		process.exit(1);
	}

	const basePath = (() => {
		try {
			const pathname = new URL(config.site.url).pathname.replace(/\/+$/, "");
			return pathname + "/";
		} catch (error) {
			return "/";
		}
	})();

	// 附带产物先生成好，才能一起参与资源版本号；页面渲染时要用这个版本号拼资源 URL。
	const searchIndexJs = renderSearchIndex(tools, sites);
	const faviconSvg = renderFavicon();
	const assetVersion = hashAssets([
		fs.readFileSync(path.join(ASSETS, "css", "main.css")),
		fs.readFileSync(path.join(ASSETS, "js", "main.js")),
		fs.readFileSync(path.join(ASSETS, "js", "tools.js")),
		searchIndexJs,
		faviconSvg,
	]);

	const ctx = {
		config,
		base: basePath,
		assetVersion,
		tools,
		sites,
		categories: {
			tools: buildCategories(tools),
			sites: buildCategories(sites),
		},
		stats: {
			toolCount: tools.filter((tool) => !tool.url).length,
			siteCount: sites.length,
			// 详情页才会渲染下载按钮，所以只统计有详情页的工具。
			downloadCount: tools.filter((tool) => !tool.url && resolveDownload(config, tool)).length,
		},
		hotTags: (config.hero.tags || []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8),
	};

	// 清空并重建 dist
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });

	/* ---- 页面 ---- */
	const taskList = [pages.home(ctx), pages.toolsHub(ctx), pages.sitesHub(ctx)];
	tools
		.filter((tool) => !tool.url)
		.forEach((tool) => taskList.push(pages.toolDetail(ctx, tool)));
	taskList.push(pages.notFound(ctx));

	// 首页由下面的循环统一收录，避免重复条目。
	const sitemapUrls = [];

	taskList.forEach((page) => {
		const html = renderDocument(page, ctx);
		const isFile = /\.html?$/i.test(page.path);
		writeFile(isFile ? page.path : page.path + "index.html", html);

		if (!page.noIndex && page.path !== "404.html") {
			const isHome = page.nav === "home";
			sitemapUrls.push({
				loc: joinUrl(config.site.url, page.path),
				changefreq: isHome ? "daily" : "weekly",
				priority: isHome ? "1.0" : "0.8",
			});
		}
	});

	/* ---- 静态资源 ---- */
	copyDir(ASSETS, path.join(DIST, "assets"));

	/* ---- 本地下载文件（可选）----
	 * 项目根部的 downloads/ 会原样复制到 dist/downloads/。
	 * 为什么必须由构建来拷：dist 每轮构建都会被清空重建，
	 * 手动往 dist/downloads/ 里丢的文件下次构建就没了。 */
	const DOWNLOADS = path.join(ROOT, "downloads");
	let downloadFiles = [];
	if (fs.existsSync(DOWNLOADS)) {
		copyDir(DOWNLOADS, path.join(DIST, "downloads"));
		downloadFiles = written.filter(
			(item) => item.path.replace(/\\/g, "/").indexOf("downloads/") === 0
		);
	}

	/* ---- 附带产物 ---- */
	writeFile("assets/js/search-index.js", searchIndexJs);
	writeFile("assets/favicon.svg", faviconSvg);
	writeFile("sitemap.xml", renderSitemap(sitemapUrls));
	writeFile("robots.txt", renderRobots());
	writeFile("_headers", renderHeaders());

	/* ---- 控制台报告 ---- */
	const totalSize = written.reduce((sum, item) => sum + item.size, 0);
	const biggest = written.slice().sort((a, b) => b.size - a.size)[0];

	console.log("\n✔ 构建完成 → dist/\n");
	console.log(`  页面数        ${taskList.length}`);
	console.log(`  工具          内置 ${ctx.stats.toolCount} 款 / 外链 ${tools.length - ctx.stats.toolCount} 款`);
	console.log(`  网址          ${ctx.stats.siteCount} 个，分 ${ctx.categories.sites.length} 类`);
	console.log(
		`  下载按钮      ${
			ctx.stats.downloadCount
				? `${ctx.stats.downloadCount} 个工具页已启用`
				: "未配置（在 site.config.js 的 toolDownload 里填 url）"
		}`
	);

	if (downloadFiles.length) {
		console.log(`  下载文件      ${downloadFiles.length} 个（来自 downloads/）`);

		// Cloudflare Pages 单文件上限 25 MB，超了会部署失败 —— 提前拦下来。
		const oversize = downloadFiles.filter((item) => item.size > 25 * 1024 * 1024);
		if (oversize.length) {
			console.log("\n  ⚠ 以下文件超过 Cloudflare Pages 单文件 25 MB 上限，会导致部署失败：");
			oversize.forEach((item) => {
				console.log(`     - ${item.path}（${(item.size / 1048576).toFixed(1)} MB）`);
			});
		}
	}
	console.log(`  产出文件      ${written.length} 个，合计 ${(totalSize / 1024).toFixed(1)} KB`);
	console.log(`  最大文件      ${biggest.path}（${(biggest.size / 1024).toFixed(1)} KB）`);
	console.log(`  部署根路径    ${basePath}`);
	console.log(`  资源版本号    ${assetVersion}`);

	if (check.orphan.length) {
		console.log(`\n  ⚠ assets/js/tools.js 中这些实现没有对应的数据条目：${check.orphan.join(", ")}`);
	}

	console.log("\n  预览：npx serve dist      部署：把 dist 目录拖进 Cloudflare Pages\n");
}

main();
