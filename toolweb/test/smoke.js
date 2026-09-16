#!/usr/bin/env node
/**
 * 静态站回归测试（不参与部署）。
 *
 * 用 jsdom 加载 dist/ 里的真实产物，执行 main.js + tools.js，
 * 逐款验证 12 个工具引擎的输入输出，并验证工具大全的前端筛选。
 *
 * 运行：
 *   NODE_PATH=<jsdom 所在目录> node test/smoke.js
 *   或 npm test（若已安装 jsdom）
 */
const fs = require("fs");
const path = require("path");
const { TextEncoder, TextDecoder } = require("node:util");
const { webcrypto } = require("node:crypto");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const MAIN_JS = fs.readFileSync(path.join(DIST, "assets/js/main.js"), "utf8");
const TOOLS_JS = fs.readFileSync(path.join(DIST, "assets/js/tools.js"), "utf8");

/* ------------------------------------------------------------------ *
 * 迷你断言
 * ------------------------------------------------------------------ */
let passed = 0;
const failures = [];
let currentSuite = "";

function suite(name) {
	currentSuite = name;
}

function ok(condition, message) {
	if (condition) {
		passed += 1;
	} else {
		failures.push(`${currentSuite} → ${message}`);
	}
}

function eq(actual, expected, message) {
	ok(actual === expected, `${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
}

function has(haystack, needle, message) {
	ok(String(haystack).indexOf(needle) > -1, `${message}（未包含 ${JSON.stringify(needle)}）`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 去掉 CSS 注释。
 * 必须做这一步再去匹配规则：注释里出现的 `[hidden]{display:none}` 这类示例文本
 * 会被正则当成真规则，导致检查「通过」但实际没有该规则。
 */
function stripCssComments(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/* ------------------------------------------------------------------ *
 * 加载页面
 * ------------------------------------------------------------------ */
function loadHtml(relPath) {
	const file = path.join(DIST, relPath);
	if (!fs.existsSync(file)) {
		throw new Error(`缺少构建产物：${relPath}，请先执行 node build.js`);
	}
	return fs.readFileSync(file, "utf8");
}

/**
 * 在 jsdom 中打开一个页面并执行站点脚本。
 *
 * 真实浏览器里 defer 脚本在 readyState 为 interactive 时执行，会立即初始化；
 * 这里先等 jsdom 解析完成（DOMContentLoaded 已触发）再执行脚本，行为一致且确定性更好。
 *
 * @param {string} relPath dist 内的相对路径
 * @param {{tools?: boolean}} options tools=true 时额外执行 tools.js
 */
async function open(relPath, options = {}) {
	const errors = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on("jsdomError", (error) => errors.push(error.message));
	virtualConsole.on("error", (message) => errors.push(String(message)));

	const dom = new JSDOM(loadHtml(relPath), {
		runScripts: "dangerously",
		pretendToBeVisual: true,
		url: "https://example.com/" + relPath.replace(/index\.html$/, ""),
		virtualConsole,
	});

	const win = dom.window;

	await new Promise((resolve) => {
		if (win.document.readyState !== "loading") {
			resolve();
			return;
		}
		win.document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
	});

	win.TextEncoder = TextEncoder;
	win.TextDecoder = TextDecoder;

	// jsdom 不实现 crypto.subtle，用 Node 的 WebCrypto 补上（与浏览器行为一致）。
	if (win.crypto && !win.crypto.subtle) {
		Object.defineProperty(win.crypto, "subtle", {
			value: webcrypto.subtle,
			configurable: true,
		});
	}

	win.addEventListener("error", (event) => errors.push(event.message));

	win.eval(MAIN_JS);
	if (options.tools) {
		win.eval(TOOLS_JS);
	}

	const document = win.document;
	const app = document.querySelector('[data-role="tool-app"]');

	return {
		dom,
		win,
		document,
		errors,
		app,
		body: app ? app.querySelector('[data-role="tool-body"]') : null,
		close: () => dom.window.close(),
	};
}

/* ------------------------------------------------------------------ *
 * DOM 交互助手
 * ------------------------------------------------------------------ */
const q = (root, sel) => Array.from(root.querySelectorAll(sel));
const tas = (root) => q(root, "textarea");
const inputs = (root) => q(root, "input");
const buttons = (root) => q(root, "button");

function btn(root, label) {
	const found = buttons(root).filter((item) => item.textContent.trim() === label);
	return found[0] || null;
}

function click(node) {
	if (!node) {
		return false;
	}
	node.click();
	return true;
}

/** 设置表单值并派发 input 事件（模拟用户输入）。 */
function type(node, value, win) {
	node.value = value;
	node.dispatchEvent(new win.Event("input", { bubbles: true }));
}

function check(box, value, win) {
	box.checked = value;
	box.dispatchEvent(new win.Event("change", { bubbles: true }));
}

const statusOf = (body) => {
	const node = body.querySelector(".tw-tool__status");
	return node ? node.textContent : "";
};

/** 每个工具的通用体检：挂载成功、有控件、无脚本错误。 */
function healthCheck(slug, page) {
	suite(slug);
	ok(page.app, "详情页缺少 [data-role=tool-app]");
	ok(page.body, "详情页缺少 [data-role=tool-body]");
	ok(!page.body.textContent.includes("工具加载中"), "工具引擎未挂载（仍显示加载中）");
	ok(!page.body.textContent.includes("暂不可用"), "工具引擎缺少该 slug 的实现");
	ok(!page.body.textContent.includes("初始化失败"), "工具引擎初始化抛错");
	ok(page.body.children.length > 0, "工具主体为空");
	ok(
		q(page.body, "button, input, textarea, select").length > 0,
		"工具没有任何可交互控件"
	);
	ok(page.errors.length === 0, `页面脚本报错：${page.errors.join(" | ")}`);
}

/* ================================================================== *
 * 逐款工具测试
 * ================================================================== */
const SUITES = [];
const test = (slug, fn) => SUITES.push({ slug, fn });

/* ---- JSON ---- */
test("json", (page) => {
	const [source, result] = tas(page.body);
	type(source, '{"b":1,"a":[1,2]}', page.win);
	click(btn(page.body, "格式化"));
	has(result.value, '\n  "b": 1', "格式化未缩进");
	has(result.value, '"a": [', "格式化未保留数组");

	click(btn(page.body, "压缩"));
	eq(result.value, '{"b":1,"a":[1,2]}', "压缩结果不正确");

	click(btn(page.body, "四空格缩进"));
	has(result.value, '\n    "b": 1', "四空格缩进不正确");
	has(statusOf(page.body), "校验通过", "成功状态未提示");

	type(source, "{坏掉的 json", page.win);
	click(btn(page.body, "格式化"));
	eq(result.value, "", "非法 JSON 应清空输出");
	has(statusOf(page.body), "解析失败", "非法 JSON 未报错");
});

/* ---- Base64 ---- */
test("base64", (page) => {
	const [source, result] = tas(page.body);
	type(source, "你好世界", page.win);
	click(btn(page.body, "编码"));
	eq(result.value, "5L2g5aW95LiW55WM", "中文 Base64 编码不正确");

	type(source, result.value, page.win);
	click(btn(page.body, "解码"));
	eq(result.value, "你好世界", "Base64 解码未还原中文");

	// URL 安全模式：去掉 = 补位。
	const box = inputs(page.body).filter((node) => node.type === "checkbox")[0];
	check(box, true, page.win);
	type(source, "\u00ff", page.win);
	click(btn(page.body, "编码"));
	eq(result.value, "w78", "URL 安全模式未移除 = 补位");

	type(source, "@@@不是base64@@@", page.win);
	click(btn(page.body, "解码"));
	has(statusOf(page.body), "不是合法的 Base64", "非法 Base64 未报错");
});

/* ---- URL ---- */
test("url", (page) => {
	const [source, result] = tas(page.body);
	type(source, "a b&c", page.win);
	click(btn(page.body, "编码"));
	eq(result.value, "a%20b%26c", "组件编码不正确");

	click(btn(page.body, "解码"));
	eq(result.value, "a b&c", "组件解码不正确");

	const box = inputs(page.body).filter((node) => node.type === "checkbox")[0];
	check(box, true, page.win);
	type(source, "https://a.com/b?x=1&y=中", page.win);
	click(btn(page.body, "编码"));
	eq(result.value, "https://a.com/b?x=1&y=%E4%B8%AD", "整体链接模式未保留分隔符");
});

/* ---- 哈希 ---- */
test("hash", async (page) => {
	const [, result] = tas(page.body);
	const source = tas(page.body)[0];
	const select = page.body.querySelector("select");

	type(source, "abc", page.win);
	click(btn(page.body, "计算"));
	await sleep(80);
	eq(
		result.value,
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		"SHA-256 摘要不正确"
	);
	has(statusOf(page.body), "SHA-256", "算法名未回显");

	select.value = "SHA-1";
	select.dispatchEvent(new page.win.Event("change", { bubbles: true }));
	await sleep(80);
	eq(result.value, "a9993e364706816aba3e25717850c26c9cd0d89d", "SHA-1 摘要不正确");
});

/* ---- 密码 ---- */
test("password", (page) => {
	const [result] = tas(page.body);
	const [length, amount] = inputs(page.body).filter((node) => node.type === "number");

	// 挂载时已自动生成一条。
	let lines = result.value.split("\n");
	eq(lines.length, 1, "默认应生成 1 条密码");
	eq(lines[0].length, 20, "默认长度应为 20");
	ok(/[A-Z]/.test(lines[0]), "缺少大写字母");
	ok(/[a-z]/.test(lines[0]), "缺少小写字母");
	ok(/[0-9]/.test(lines[0]), "缺少数字");
	ok(/[^A-Za-z0-9]/.test(lines[0]), "缺少特殊符号");
	has(statusOf(page.body), "强度", "未给出强度评估");

	type(amount, "3", page.win);
	type(length, "8", page.win);
	click(btn(page.body, "生成密码"));
	lines = result.value.split("\n");
	eq(lines.length, 3, "批量生成数量不正确");
	eq(lines[0].length, 8, "自定义长度未生效");
	eq(new Set(lines).size, 3, "批量生成出现重复密码");
	ok(
		lines.every((line) => /[A-Z]/.test(line) && /[a-z]/.test(line) && /[0-9]/.test(line)),
		"未保证每种已选字符类型至少出现一次"
	);

	click(btn(page.body, "重新生成"));
	ok(result.value.split("\n")[0] !== lines[0], "重新生成未产生新密码");

	// 取消全部字符类型应报错。
	inputs(page.body)
		.filter((node) => node.type === "checkbox")
		.forEach((box) => check(box, false, page.win));
	click(btn(page.body, "生成密码"));
	has(statusOf(page.body), "至少选择一种字符类型", "未校验字符类型");
});

/* ---- UUID ---- */
test("uuid", (page) => {
	const [result] = tas(page.body);
	// 挂载时自动生成。
	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	let lines = result.value.split("\n");
	eq(lines.length, 10, "默认应生成 10 个 UUID");
	ok(lines.every((line) => UUID_RE.test(line)), "生成的不是合法 UUID v4");
	eq(new Set(lines).size, 10, "生成的 UUID 出现重复");

	const boxes = inputs(page.body).filter((node) => node.type === "checkbox");
	boxes.forEach((box) => check(box, true, page.win));
	click(btn(page.body, "生成"));
	lines = result.value.split("\n");
	eq(lines.length, 10, "数量异常");
	ok(
		lines.every((line) => /^[0-9A-F]{32}$/.test(line)),
		"大写 + 去连字符输出不正确"
	);

	type(inputs(page.body).filter((node) => node.type === "number")[0], "0", page.win);
	click(btn(page.body, "生成"));
	eq(result.value.split("\n").length, 1, "数量应被钳制到最小 1");
});

/* ---- 时间戳 ---- */
test("timestamp", (page) => {
	const stampInput = inputs(page.body)[0];
	const dateOutput = tas(page.body)[0];

	type(stampInput, "1735689600", page.win);
	click(btn(page.body, "转换为日期"));
	has(dateOutput.value, "2025-01-01", "秒级时间戳转换不正确");
	has(statusOf(page.body), "秒", "未按秒解析");

	type(stampInput, "1735689600000", page.win);
	click(btn(page.body, "转换为日期"));
	has(dateOutput.value, "2025-01-01", "毫秒级时间戳转换不正确");
	has(statusOf(page.body), "毫秒", "未按毫秒解析");

	type(stampInput, "not-a-number", page.win);
	click(btn(page.body, "转换为日期"));
	has(statusOf(page.body), "纯数字", "非法时间戳未报错");
});

/* ---- 日期计算 ---- */
test("datecalc", (page) => {
	const dates = inputs(page.body).filter((node) => node.type === "date");
	type(dates[0], "2025-01-01", page.win);
	type(dates[1], "2025-01-31", page.win);
	click(btn(page.body, "计算相差"));
	const diff = tas(page.body)[0];
	has(diff.value, "相差天数：  30 天", "日期差计算不正确");
	has(diff.value, "工作日数", "缺少工作日统计");

	type(dates[2], "2025-01-01", page.win);
	const delta = inputs(page.body).filter((node) => node.type === "number")[0];
	type(delta, "30", page.win);
	click(btn(page.body, "推算日期"));
	const shift = tas(page.body)[1];
	has(shift.value, "结果日期： 2025-01-31", "日期推算不正确");

	type(delta, "-1", page.win);
	click(btn(page.body, "推算日期"));
	has(shift.value, "结果日期： 2024-12-31", "负数偏移推算不正确");
});

/* ---- 进制转换 ---- */
test("radix", (page) => {
	const [bin, oct, dec, hex] = inputs(page.body);
	type(dec, "255", page.win);
	eq(bin.value, "11111111", "十进制转二进制不正确");
	eq(oct.value, "377", "十进制转八进制不正确");
	eq(hex.value, "FF", "十进制转十六进制不正确（应默认大写）");

	type(hex, "a0", page.win);
	eq(dec.value, "160", "十六进制转十进制不正确");

	type(bin, "1010", page.win);
	eq(dec.value, "10", "二进制转十进制不正确");

	type(dec, "zzz", page.win);
	has(statusOf(page.body), "不是合法的", "非法输入未报错");
});

/* ---- 文本工具箱 ---- */
test("text", (page) => {
	const [source] = tas(page.body);
	type(source, "abc", page.win);

	click(btn(page.body, "全部大写"));
	eq(source.value, "ABC", "全部大写不正确");

	click(btn(page.body, "全部小写"));
	eq(source.value, "abc", "全部小写不正确");

	click(btn(page.body, "首字母大写"));
	eq(source.value, "Abc", "首字母大写不正确");

	click(btn(page.body, "反转字符"));
	eq(source.value, "cbA", "反转字符不正确");

	type(source, "b\na\nb\n\nc", page.win);
	click(btn(page.body, "按行排序"));
	eq(source.value.split("\n")[0], "", "按行排序结果异常");

	type(source, "b\na\nb\n\nc", page.win);
	click(btn(page.body, "去除重复行"));
	eq(source.value, "b\na\n\nc", "去除重复行不正确");

	click(btn(page.body, "删除空行"));
	eq(source.value, "b\na\nc", "删除空行不正确");

	click(btn(page.body, "反转行序"));
	eq(source.value, "c\na\nb", "反转行序不正确");

	type(source, "a   b", page.win);
	click(btn(page.body, "压缩多余空格"));
	eq(source.value, "a b", "压缩多余空格不正确");

	// 实时统计。
	const stats = Array.from(page.body.querySelectorAll(".tw-stats__item")).map((item) => [
		item.querySelector("dt").textContent,
		item.querySelector("dd").textContent,
	]);
	const map = Object.fromEntries(stats);
	eq(map["字符数"], "3", "字符数统计不正确");
	eq(map["UTF-8 字节"], "3", "字节数统计不正确");
});

/* ---- 正则测试 ---- */
test("regex", async (page) => {
	const pattern = inputs(page.body)[0];
	const text = tas(page.body)[0];
	const highlight = page.body.querySelector(".tw-regex__preview");
	const groups = page.body.querySelector(".tw-regex__groups");

	type(pattern, "\\d{4}-(\\d{2})-(\\d{2})", page.win);
	type(text, "2025-01-01 and 2026-12-31", page.win);
	await sleep(400);

	eq(q(highlight, "mark").length, 2, "匹配高亮数量不正确");
	eq(q(groups, ".tw-regex__group").length, 2, "捕获分组数量不正确");
	has(groups.textContent, "$1 = 01", "捕获分组内容不正确");
	has(statusOf(page.body), "匹配到 2 处", "匹配计数不正确");

	type(pattern, "(", page.win);
	await sleep(400);
	has(statusOf(page.body), "正则语法错误", "非法正则未报错");
});

/* ---- 颜色转换 ---- */
test("color", (page) => {
	const source = inputs(page.body).filter((node) => node.type === "text")[0];
	const [result] = tas(page.body);

	type(source, "#ff0000", page.win);
	click(btn(page.body, "转换"));
	has(result.value, "RGB： rgb(255, 0, 0)", "HEX → RGB 不正确");
	has(result.value, "HSL： hsl(0, 100%, 50%)", "HEX → HSL 不正确");
	has(result.value, "HEX（简写）：#f00", "HEX 简写不正确");

	type(source, "rgb(37, 99, 235)", page.win);
	click(btn(page.body, "转换"));
	has(result.value, "HEX： #2563eb", "RGB → HEX 不正确");

	type(source, "不认识的颜色", page.win);
	click(btn(page.body, "转换"));
	has(statusOf(page.body), "无法识别", "非法颜色未报错");
});

/* ================================================================== *
 * 工具大全前端筛选
 * ================================================================== */
async function testHubFilter() {
	suite("工具大全筛选");
	const page = await open("tools/index.html");
	const hub = page.document.querySelector('[data-hub="tools"]');
	const input = hub.querySelector('[data-role="hub-search"]');
	const count = hub.querySelector('[data-role="hub-count"]');
	const items = q(hub, '[data-role="tool-item"]');
	const empty = hub.querySelector('[data-role="hub-empty"]');

	const visible = () => items.filter((item) => !item.hidden);

	eq(items.length, 12, "工具大全卡片数量不正确");
	eq(visible().length, 12, "初始应全部可见");
	has(count.textContent, "共 12 款工具", "初始计数不正确");

	type(input, "json", page.win);
	await sleep(200);
	eq(visible().length, 1, "关键词筛选结果不正确");
	has(count.textContent, "共 1 款工具", "筛选后计数未更新");

	type(input, "时间戳", page.win);
	await sleep(200);
	eq(visible().length, 1, "中文关键词筛选不正确");

	type(input, "不存在的工具xyz", page.win);
	await sleep(200);
	eq(visible().length, 0, "无结果时应全部隐藏");
	ok(!empty.hidden, "无结果时未显示空状态提示");

	type(input, "", page.win);
	await sleep(200);
	eq(visible().length, 12, "清空关键词后未恢复");

	const chip = q(hub, ".tw-chip[data-filter]").filter(
		(item) => item.getAttribute("data-filter") === "编码转换"
	)[0];
	click(chip);
	await sleep(50);
	eq(visible().length, 3, "分类筛选结果不正确");
	ok(chip.classList.contains("is-active"), "选中分类未高亮");

	const all = q(hub, ".tw-chip[data-filter]")[0];
	click(all);
	await sleep(50);
	eq(visible().length, 12, "恢复全部分类失败");

	ok(page.errors.length === 0, `页面脚本报错：${page.errors.join(" | ")}`);
	page.close();
}

/* ================================================================== *
 * 附带产物
 * ================================================================== */
function testArtifacts() {
	suite("附带产物");

	// search-index.js 必须是合法 JS，且内容与数据源一致。
	const raw = fs.readFileSync(path.join(DIST, "assets/js/search-index.js"), "utf8");
	has(raw, "window.TW_INDEX=", "search-index 未挂载到 window.TW_INDEX");
	const payload = JSON.parse(raw.replace(/^window\.TW_INDEX=/, "").replace(/;\s*$/, ""));
	eq(payload.tools.length, 12, "搜索索引工具数量不正确");
	eq(payload.sites.length, 10, "搜索索引网址数量不正确");
	eq(payload.tools[0].k, "工具", "搜索索引类型标记不正确");
	eq(payload.sites[0].k, "网址", "搜索索引网址类型标记不正确");
	ok(
		payload.tools.every((item) => item.u.startsWith("/")),
		"内置工具的搜索链接应为站内绝对路径"
	);
	ok(
		payload.sites.every((item) => /^https?:\/\//.test(item.u)),
		"网址搜索链接应为外链"
	);

	// sitemap 覆盖全部页面。
	const sitemap = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
	const locs = (sitemap.match(/<loc>/g) || []).length;
	eq(locs, 15, "sitemap 条目数不正确（首页 + 工具大全 + 网址导航 + 12 个工具页）");
	has(sitemap, "https://example.com/tools/json/", "sitemap 缺少工具页");
	ok(!sitemap.includes("404"), "sitemap 不应包含 404");

	// robots
	const robots = fs.readFileSync(path.join(DIST, "robots.txt"), "utf8");
	has(robots, "Sitemap: https://example.com/sitemap.xml", "robots 未指向 sitemap");

	// _headers
	const headers = fs.readFileSync(path.join(DIST, "_headers"), "utf8");
	has(headers, "X-Content-Type-Options: nosniff", "_headers 缺少安全头");
	has(headers, "immutable", "_headers 缺少静态资源缓存策略");

	// 404 页面标记 noindex
	const notFound = fs.readFileSync(path.join(DIST, "404.html"), "utf8");
	has(notFound, "noindex", "404 页面未标记 noindex");
}

/* ================================================================== *
 * 页面骨架
 * ================================================================== */
async function testShell() {
	suite("页面骨架");
	// [文件, 标题应包含的文案]
	const pages = [
		["index.html", "在线工具箱"],
		["tools/index.html", "工具大全"],
		["sites/index.html", "网址导航"],
		["404.html", "页面不存在"],
	];

	for (const [file, title] of pages) {
		const page = await open(file);
		const doc = page.document;
		has(doc.title, title, `${file} 标题不正确`);
		ok(doc.querySelector('link[rel="canonical"]'), `${file} 缺少 canonical`);
		ok(doc.querySelector(".tw-header"), `${file} 缺少页头`);
		ok(doc.querySelector(".tw-footer"), `${file} 缺少页脚`);
		ok(doc.querySelector("#tw-content"), `${file} 缺少主内容区`);
		ok(doc.querySelector('script[src*="assets/js/main.js"]'), `${file} 未引入 main.js`);
		ok(doc.querySelectorAll("h1").length >= 1, `${file} 缺少 h1`);
		ok(doc.querySelector('a[href="#tw-content"]'), `${file} 缺少跳转链接`);
		ok(page.errors.length === 0, `${file} 脚本报错：${page.errors.join(" | ")}`);

		// 主题必须在首屏前确定，避免闪烁。
		ok(
			["light", "dark"].includes(doc.documentElement.getAttribute("data-theme")),
			`${file} data-theme 未初始化`
		);

		// 交互脚本应当完成初始化且不抛错。
		click(doc.querySelector('[data-action="theme"]'));
		click(doc.querySelector('[data-action="drawer"]'));
		click(doc.querySelector('[data-action="search"]'));
		ok(page.errors.length === 0, `${file} 交互后报错：${page.errors.join(" | ")}`);
		page.close();
	}

	// 工具页：必须引入 tools.js，且工具引擎真的挂载完成。
	const tool = await open("tools/json/index.html", { tools: true });
	ok(
		tool.document.querySelector('script[src*="assets/js/tools.js"]'),
		"工具详情页未引入 tools.js"
	);
	tool.close();
}

/* ================================================================== *
 * 样式覆盖：HTML 里出现的 class 必须在 main.css 中有定义
 * ================================================================== */
function testStyleCoverage() {
	suite("样式覆盖");
	// 剥掉注释再检查：注释里提到的类名不算「已写样式」。
	const css = stripCssComments(fs.readFileSync(path.join(DIST, "assets/css/main.css"), "utf8"));

	// 由 JS 运行时添加、或纯结构性（不需要独立样式）的类名。
	const ALLOW = new Set([
		// --- JS 运行时添加 ---
		"is-open",
		"is-active",
		"is-current",
		"is-scrolled",
		"is-visible",
		"is-strong",
		"is-good",
		"is-fair",
		"is-weak",
		"is-ok",
		"is-warn",
		"is-err",
		"tw-locked",
		"tw-ready",
		"tw-toast--ok",
		"tw-toast--err",
		"tw-tool__status",
		// --- 结构性 / BEM 修饰类：样式由基础类承载，自身无独立规则 ---
		"tw-card--tool",
		"tw-card--site",
		"tw-chip--link",
		"tw-icon--emoji",
		"tw-layout__main",
		"tw-no-sidebar",
		"tw-tool__body",
		"tw-tool__head-actions",
		"tw-searchbox__results",
	]);

	const htmlFiles = [];
	(function walk(dir) {
		fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith(".html")) {
				htmlFiles.push(full);
			}
		});
	})(DIST);

	const used = new Set();
	htmlFiles.forEach((file) => {
		const html = fs.readFileSync(file, "utf8");
		(html.match(/class="([^"]*)"/g) || []).forEach((attr) => {
			attr
				.replace(/^class="|"$/g, "")
				.split(/\s+/)
				.filter(Boolean)
				.forEach((name) => used.add(name));
		});
	});

	const missing = Array.from(used)
		.filter((name) => !ALLOW.has(name))
		.filter((name) => css.indexOf("." + name) === -1)
		.sort();

	ok(missing.length === 0, `main.css 缺少这些类的样式：${missing.join(", ")}`);

	// 深浅色变量必须成对出现，保证暗色模式可用。
	ok(/:root\s*\{/.test(css), "缺少 light 主题变量");
	ok(/\[data-theme="dark"\]\s*\{/.test(css), "缺少 dark 主题变量");
	["--tw-primary", "--tw-radius", "--tw-container"].forEach((token) => {
		has(css, token, `缺少主题变量 ${token}`);
	});

	// 移除侧栏后，工具详情页必须是单列布局。
	has(css, "grid-template-columns: minmax(0, 1fr);", "主布局未改为单列");

	// 卡片描述统一截断 2 行，保证卡片等高。
	has(css, "-webkit-line-clamp: 2", "卡片描述未做行数截断");

	// 响应式与无障碍。
	ok(/@media[^{]*max-width/.test(css), "缺少响应式断点");
	ok(/prefers-reduced-motion/.test(css), "缺少无障碍动效降级");
	ok(/prefers-color-scheme/.test(css), "缺少系统主题跟随的 meta 回退");
}

/* ================================================================== *
 * 站内资源引用：每个 /assets/... 与站内链接都必须真实存在
 * ================================================================== */
function testAssetRefs() {
	suite("资源引用");
	const htmlFiles = [];
	(function walk(dir) {
		fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith(".html")) {
				htmlFiles.push(full);
			}
		});
	})(DIST);

	const assetMissing = new Set();
	const linkMissing = new Set();

	htmlFiles.forEach((file) => {
		// 下载按钮的 href 是用户填的下载地址（可能指向站外，或由运维单独上传到服务器），
		// 不参与「站内断链」检查 —— 否则一配上下载链接，测试就因为查不到该文件而变红。
		const html = fs
			.readFileSync(file, "utf8")
			.replace(/<a[^>]*data-role="tool-download"[^>]*>/g, "");
		const refs = html.match(/(?:href|src)="(\/[^"]*)"/g) || [];

		refs.forEach((raw) => {
			const url = raw.replace(/^(?:href|src)="/, "").replace(/"$/, "").split("#")[0].split("?")[0];
			if (!url || url === "/") {
				return;
			}

			const isAsset = url.indexOf("/assets/") === 0;
			// 站内链接以 / 开头且不含协议；外链已在模板里写成完整 https:// 形式。
			const candidates = isAsset
				? [path.join(DIST, url)]
				: [path.join(DIST, url), path.join(DIST, url, "index.html"), path.join(DIST, url.replace(/\/$/, "") + ".html")];

			if (!candidates.some((item) => fs.existsSync(item) && fs.statSync(item).isFile())) {
				(isAsset ? assetMissing : linkMissing).add(url);
			}
		});
	});

	ok(assetMissing.size === 0, `引用了不存在的资源：${Array.from(assetMissing).join(", ")}`);
	ok(linkMissing.size === 0, `存在断链：${Array.from(linkMissing).join(", ")}`);

	// 反向检查：assets 里的文件都被引用了（favicon 由 <link> 引用，不算孤立）。
	const usedAssets = new Set();
	htmlFiles.forEach((file) => {
		(fs.readFileSync(file, "utf8").match(/\/assets\/[^"'?#\s]+/g) || []).forEach((item) => usedAssets.add(item));
	});
	["/assets/css/main.css", "/assets/js/main.js"].forEach((item) => {
		ok(usedAssets.has(item), `${item} 没有被任何页面引用`);
	});
}

/* ------------------------------------------------------------------ *
 * 资源版本号
 * ------------------------------------------------------------------ */
/**
 * `_headers` 把 /assets/* 设成 `immutable` 一年，浏览器期间不会回源。
 * 资源 URL 不带版本号的话，改了 CSS/JS 老访客会一直吃缓存里的旧文件 ——「修了但用户看不到」。
 * 这里守住「每个页面的资源 URL 都带版本号，且全站用同一个」。
 */
function testAssetVersion() {
	suite("资源版本号");

	const htmlFiles = [];
	(function walk(dir) {
		fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".html")) htmlFiles.push(full);
		});
	})(DIST);

	ok(htmlFiles.length > 0, "没有找到任何 HTML 产物");

	const versions = new Set();
	const problems = [];
	const versionOf = (value) => (value.match(/[?&]v=([^&"]+)/) || [])[1] || "";

	htmlFiles.forEach((file) => {
		const html = fs.readFileSync(file, "utf8");
		const rel = path.relative(DIST, file);

		[
			["main.css", /href="([^"]*assets\/css\/main\.css[^"]*)"/],
			["main.js", /src="([^"]*assets\/js\/main\.js[^"]*)"/],
			["favicon.svg", /href="([^"]*assets\/favicon\.svg[^"]*)"/],
			["tools.js", /src="([^"]*assets\/js\/tools\.js[^"]*)"/],
		].forEach(([label, pattern]) => {
			const match = html.match(pattern);
			if (!match) {
				// 只有工具详情页会引 tools.js，其余页面匹配不到属正常。
				if (label !== "tools.js") {
					problems.push(`${rel} 未引用 ${label}`);
				}
				return;
			}
			const version = versionOf(match[1]);
			if (!version) {
				problems.push(`${rel} 的 ${label} 没有版本号`);
			} else {
				versions.add(version);
			}
		});
	});

	ok(problems.length === 0, `资源版本号异常：${problems.slice(0, 5).join("；")}`);
	eq(versions.size, 1, "各页面使用的资源版本号不一致");

	const version = Array.from(versions)[0] || "";
	ok(/^[0-9a-f]{8}$/.test(version), `资源版本号应为 8 位十六进制，实际 ${JSON.stringify(version)}`);

	// 搜索索引也必须带上同一个版本号（由 main.js 从自身 script 地址推导）。
	ok(
		/assetSrc\(\s*"assets\/js\/search-index\.js"\s*\)/.test(MAIN_JS),
		"main.js 加载 search-index.js 时没有拼版本号"
	);

	// 从 main.js 源码里取出「版本号提取正则」，用它去匹配真实的 script 地址 ——
	// 这条正则错了，search-index.js 就会被旧缓存挡住。
	// （jsdom 里 document.currentScript 为 null，跑不到这段逻辑，只能这样验。）
	const literal = MAIN_JS.match(/SELF\.match\((\/\[\?&\]v=[^/]*\/)\)/);
	ok(literal, "main.js 缺少版本号提取正则");
	if (literal) {
		const re = new RegExp(literal[1].slice(1, -1));
		[
			["https://a.com/assets/js/main.js?v=ba677632", "ba677632"],
			["https://a.com/sub/assets/js/main.js?v=deadbeef", "deadbeef"],
			["https://a.com/assets/js/main.js?v=1&x=2", "1"],
			["https://a.com/assets/js/main.js", ""],
		].forEach(([src, expected]) => {
			eq((src.match(re) || [])[1] || "", expected, `版本号提取失败：${src}`);
		});
	}
}

/* ------------------------------------------------------------------ *
 * hidden 属性防护（只在真实浏览器里才会暴露的一类 bug）
 * ------------------------------------------------------------------ */
/**
 * 浏览器默认样式里的 `[hidden]{display:none}` 属于 **UA 样式**，优先级低于本站 CSS 里的
 * **任何** display 声明。jsdom 不做样式层叠，所以「el.hidden = true 之后是不是真的看不见」
 * 这类问题在 DOM 测试里永远抓不到 —— 只能直接审计 CSS 本身。
 *
 * 曾经的真实症状（用户报障）：
 *   - 工具大全点「编码转换」，卡片一张都没隐藏 → 筛选看起来完全失效（.tw-card 是 display:flex）
 *   - 「回到顶部」按钮在页面最顶端就已经挂着（.tw-totop 是 display:inline-flex）
 * 当时 DOM 测试断言的是 `item.hidden === true`，属性确实设上了，所以测试全绿。
 */
function testHiddenGuard() {
	suite("hidden 属性防护");
	const css = stripCssComments(fs.readFileSync(path.join(DIST, "assets/css/main.css"), "utf8"));

	// 1) 兜底规则必须存在，且必须带 !important —— 作者样式的 display 优先级更高，
	//    少一个 !important 就等于没有。
	const guard = css.match(/\[hidden\][^{}]*\{[^{}]*\}/);
	ok(guard, "main.css 缺少 [hidden] 兜底规则");
	if (guard) {
		ok(
			/display\s*:\s*none\s*!important/.test(guard[0]),
			"[hidden] 必须是 display:none !important，否则压不过 .tw-card / .tw-totop 的 display"
		);
	}

	// 2) 证明这条规则是「承重」的：下面这些类会被 hidden 属性控制，而它们自己在
	//    main.css 里声明了 display。如果哪天有人把 !important 删掉当成冗余，这里会先失败。
	const loadBearing = [".tw-card", ".tw-totop"];
	loadBearing.forEach((selector) => {
		const block = css.match(new RegExp("\\" + selector + "\\s*\\{([^{}]*)\\}"));
		ok(block, `main.css 找不到 ${selector} 的样式块`);
		if (block) {
			ok(
				/display\s*:/.test(block[1]),
				`${selector} 不再声明 display —— 若确实已不需要兜底，请同步更新本测试`
			);
		}
	});
}

/* ================================================================== *
 * 工具详情页「下载」按钮
 *
 * 下载链接来自配置（site.config.js 的 toolDownload，或 content/tools.js 里单个工具的
 * download），dist 里默认没有按钮，所以这里直接调用构建期的 resolveDownload() 和
 * pages.toolDetail() 做「解析 + 渲染」两级验证，而不是去 dist 里找按钮。
 * ================================================================== */
function testToolDownload() {
	suite("工具下载按钮");

	const { resolveDownload } = require(path.join(ROOT, "src/utils.js"));
	const { toolDetail } = require(path.join(ROOT, "src/pages.js"));

	const tool = {
		slug: "json",
		name: "JSON 格式化",
		icon: "🧩",
		category: "开发工具",
		catSlug: "开发工具",
		desc: "在线 JSON 格式化。",
		badge: "",
		featured: true,
		content: "",
		url: "",
		download: "",
	};
	const withTool = (patch) => Object.assign({}, tool, patch);

	const makeCtx = (toolDownload) => ({
		config: {
			site: { name: "工具站", url: "https://example.com" },
			seo: { jsonLd: false },
			toolDownload,
		},
		base: "/",
		assetVersion: "abcd1234",
		tools: [tool],
	});

	/* ---- 1. 什么时候不显示（有链接才显示，是这个特性的核心约定）---- */
	eq(resolveDownload({ toolDownload: { url: "" } }, tool), null, "两处都没链接时应返回 null");
	eq(resolveDownload({}, tool), null, "完全没有 toolDownload 配置时应返回 null");
	eq(
		resolveDownload({ toolDownload: { url: "https://x.com/a.zip" } }, withTool({ download: false })),
		null,
		"工具级 download:false 应单独关掉该工具"
	);
	eq(
		resolveDownload({ toolDownload: { enabled: false, url: "https://x.com/a.zip" } }, tool),
		null,
		"总开关 enabled:false 应关掉全部按钮"
	);

	/* ---- 2. 链接解析 ---- */
	const fromGlobal = resolveDownload(
		{ toolDownload: { url: "/downloads/{slug}.zip", label: "下载工具" } },
		tool
	);
	eq(fromGlobal.url, "/downloads/json.zip", "{slug} 占位符未被替换");
	eq(fromGlobal.label, "下载工具", "全局 label 未生效");
	eq(fromGlobal.newTab, false, "newTab 默认应为 false");
	eq(fromGlobal.saveAs, false, "saveAs 默认应为 false");

	eq(
		resolveDownload({ toolDownload: { url: "/dl/{category}/{name}.zip" } }, tool).url,
		"/dl/" + encodeURIComponent("开发工具") + "/" + encodeURIComponent("JSON 格式化") + ".zip",
		"{name}/{category} 未做 URL 编码"
	);

	eq(
		resolveDownload(
			{ toolDownload: { url: "/downloads/{slug}.zip" } },
			withTool({ download: "https://cdn.example.com/json.zip" })
		).url,
		"https://cdn.example.com/json.zip",
		"工具级字符串未覆盖全局 url"
	);

	const merged = resolveDownload(
		{ toolDownload: { url: "/global.zip", label: "全局", note: "全局提示", newTab: true, saveAs: true } },
		withTool({ download: { label: "离线版", newTab: false } })
	);
	eq(merged.url, "/global.zip", "工具级没给 url 时应回落到全局 url");
	eq(merged.label, "离线版", "工具级 label 未覆盖全局");
	eq(merged.note, "全局提示", "工具级没给 note 时应回落到全局");
	eq(merged.saveAs, true, "工具级没给 saveAs 时应回落到全局");
	eq(merged.newTab, false, "工具级 newTab:false 被全局 true 覆盖了（布尔项不能用 ||）");

	/* ---- 3. 真实渲染 ---- */
	const anchorOf = (html) => (html.match(/<a[^>]*data-role="tool-download"[^>]*>/) || [""])[0];

	const noBtn = toolDetail(makeCtx({ url: "" }), tool).body;
	eq(anchorOf(noBtn), "", "未配置链接时不应渲染下载按钮");
	has(noBtn, "tw-tool__head-actions", "工具页缺少操作区");
	has(noBtn, "tool-reset", "工具页缺少重置按钮");

	const btnHtml = toolDetail(
		makeCtx({ url: "/downloads/{slug}.zip", label: "下载工具", note: "离线可用版", newTab: true }),
		tool
	).body;
	has(btnHtml, 'href="/downloads/json.zip"', "下载按钮 href 不正确");
	has(btnHtml, ">下载工具</a>", "下载按钮文字不正确");
	has(btnHtml, 'target="_blank"', "newTab 未生效");
	has(btnHtml, 'rel="noopener"', "新窗口链接缺少 rel=noopener");
	has(btnHtml, 'title="离线可用版"', "note 未渲染成 title 属性");

	// 下载按钮要排在「重置」前面，否则视觉上会喧宾夺主。
	const actions = btnHtml.slice(btnHtml.indexOf("tw-tool__head-actions"));
	ok(
		actions.indexOf('href="/downloads/json.zip"') < actions.indexOf("tool-reset"),
		"下载按钮应排在重置按钮之前"
	);

	// 只有 saveAs 打开时才输出 HTML 的 download 属性。
	ok(
		/\sdownload(\s|>)/.test(anchorOf(toolDetail(makeCtx({ url: "/a.zip", saveAs: true }), tool).body)),
		"saveAs:true 时未输出 download 属性"
	);
	ok(
		!/\sdownload(\s|>)/.test(anchorOf(toolDetail(makeCtx({ url: "/a.zip" }), tool).body)),
		"saveAs 未开启时不该输出 download 属性"
	);

	/* ---- 4. 真实产物：已配置的话，href 不能是空的 ---- */
	(function walk(dir) {
		fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name === "index.html" && /[\\/]tools[\\/]/.test(full)) {
				const match = fs.readFileSync(full, "utf8").match(/<a[^>]*data-role="tool-download"[^>]*>/);
				if (match) {
					ok(
						/\shref="[^"]+"/.test(match[0]),
						`${path.relative(DIST, full)} 的下载按钮 href 为空`
					);
				}
			}
		});
	})(DIST);
}

/* ================================================================== *
 * 主流程
 * ================================================================== */
async function main() {
	if (!fs.existsSync(DIST)) {
		console.error("找不到 dist/，请先执行：node build.js");
		process.exit(1);
	}

	const toolsIndex = require(path.join(ROOT, "content/tools.js"));
	const sitesIndex = require(path.join(ROOT, "content/sites.js"));
	const slugs = toolsIndex.filter((tool) => !tool.url).map((tool) => tool.slug);

	console.log(`\n开始回归测试（${slugs.length} 款内置工具 + 聚合页 + 附带产物）\n`);

	for (const { slug, fn } of SUITES) {
		const file = `tools/${slug}/index.html`;
		let page;
		try {
			page = await open(file, { tools: true });
		} catch (error) {
			failures.push(`${slug} → 无法打开 ${file}：${error.message}`);
			continue;
		}

		healthCheck(slug, page);

		const before = failures.length;
		try {
			await fn(page);
		} catch (error) {
			failures.push(`${slug} → 测试抛错：${error.message}`);
		}

		if (failures.length === before) {
			console.log(`  ✔ ${slug.padEnd(10)} 通过`);
		} else {
			console.log(`  ✖ ${slug.padEnd(10)} 失败 ${failures.length - before} 项`);
		}
		page.close();
	}

	await testHubFilter();
	testArtifacts();
	testStyleCoverage();
	testHiddenGuard();
	testAssetRefs();
	testAssetVersion();
	testToolDownload();
	await testShell();

	// 覆盖度检查：每个内置工具都要有测试。
	const tested = new Set(SUITES.map((item) => item.slug));
	const untested = slugs.filter((slug) => !tested.has(slug));
	if (untested.length) {
		failures.push(`以下工具没有测试用例：${untested.join(", ")}`);
	}

	console.log("");
	if (failures.length) {
		console.error(`✖ 失败 ${failures.length} 项，通过 ${passed} 项\n`);
		failures.forEach((item) => console.error("   • " + item));
		console.error("");
		process.exit(1);
	}

	console.log(`✔ 全部通过（${passed} 项断言）\n`);
}

main().catch((error) => {
	console.error("测试运行失败：", error);
	process.exit(1);
});
