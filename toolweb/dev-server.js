#!/usr/bin/env node
/**
 * 本地预览服务器（零依赖，只用 Node 内置模块）。
 *
 * 用法：
 *   node dev-server.js            启动并自动打开浏览器（默认 8788 端口）
 *   node dev-server.js 9000       从指定端口开始试
 *   node dev-server.js 8788 --no-open   不自动打开浏览器
 *
 * 端口被占用不会报错退出，会自动往后顺延找空闲端口（最多试 20 个），
 * 并在启动信息里告诉你实际用的是哪个。双击 preview.bat 的人不需要关心端口。
 *
 * 它只做一件事：把 dist/ 目录当成网站根目录提供出去。
 * 之所以需要它、而不能直接双击 dist/index.html，是因为站点内部
 * 全部使用 `/assets/...`、`/tools/...` 这类绝对路径，必须有一个
 * 能响应根路径的服务器，file:// 协议下这些请求会直接失败。
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = path.join(__dirname, "dist");
const START_PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : 8788;
const HOST = "127.0.0.1";
const OPEN_BROWSER = process.argv.indexOf("--no-open") === -1;
// 端口被占用时最多往后顺延多少个端口。
const MAX_PORT_ATTEMPTS = 20;

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".ico": "image/x-icon",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

if (!fs.existsSync(ROOT)) {
	console.error(`\n  [x] 找不到 ${ROOT}\n      请先执行：node build.js\n`);
	process.exit(1);
}

/** 把 URL 路径映射到磁盘文件；目录自动找 index.html。 */
function resolveFile(urlPath) {
	let rel = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
	rel = rel.replace(/^\/+/, "");

	// 阻断 ../ 越界访问。
	const target = path.resolve(ROOT, rel);
	if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
		return null;
	}

	const stat = fs.existsSync(target) ? fs.statSync(target) : null;
	if (stat && stat.isDirectory()) {
		const index = path.join(target, "index.html");
		if (fs.existsSync(index)) return { file: index, status: 200 };
		return null;
	}
	if (stat && stat.isFile()) {
		return { file: target, status: 200 };
	}
	return null;
}

function handleRequest(req, res) {
	const hit = resolveFile(req.url || "/");

	if (!hit) {
		// 找不到就返回站点自己的 404 页面（Cloudflare Pages 行为一致）。
		const fallback = path.join(ROOT, "404.html");
		if (fs.existsSync(fallback)) {
			const body = fs.readFileSync(fallback);
			res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
			res.end(body);
		} else {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("404 Not Found");
		}
		console.log(`  404  ${req.url}`);
		return;
	}

	const ext = path.extname(hit.file).toLowerCase();
	const type = MIME[ext] || "application/octet-stream";
	const body = fs.readFileSync(hit.file);

	res.writeHead(hit.status, {
		"Content-Type": type,
		"Content-Length": body.length,
		// 本地预览永远拿最新文件，避免缓存干扰调试。
		"Cache-Control": "no-store",
	});
	res.end(req.method === "HEAD" ? undefined : body);

	if (ext !== ".css" && ext !== ".js" && ext !== ".svg") {
		console.log(`  200  ${req.url}`);
	}
}

/**
 * 尝试监听 port；如果被占用就自动顺延到 port+1，最多试 MAX_PORT_ATTEMPTS 个。
 * 这样双击 preview.bat 的人永远不需要自己去读端口号、改端口。
 */
function listen(port, attempt) {
	const server = http.createServer(handleRequest);

	server.once("error", (error) => {
		if (error.code === "EADDRINUSE") {
			if (attempt >= MAX_PORT_ATTEMPTS) {
				console.error(
					`\n  [x] 从 ${START_PORT} 起连续 ${MAX_PORT_ATTEMPTS} 个端口都被占用了，请手动指定一个空闲端口：`
				);
				console.error(`      node dev-server.js 9000\n`);
				process.exit(1);
			}
			listen(port + 1, attempt + 1);
			return;
		}
		console.error(`\n  [x] 启动失败：${error.message}\n`);
		process.exit(1);
	});

	server.once("listening", () => {
		const url = `http://${HOST}:${port}/`;

		console.log("");
		console.log("  工具站 本地预览已启动");
		console.log(`  ${url}`);
		if (port !== START_PORT) {
			console.log("");
			console.log(
				`  提示：端口 ${START_PORT} 已被占用（多半是已经开着一个预览窗口），已自动改用 ${port}。`
			);
		}
		console.log("");
		console.log("  直接编辑 dist/ 下的文件即可看到效果（已禁用缓存）。");
		console.log("  修改源码（content/、src/、assets/）后需要重新执行 node build.js。");
		console.log("");
		console.log("  按 Ctrl + C 停止服务。");
		console.log("");

		if (OPEN_BROWSER) {
			// Windows 用 start，macOS 用 open，Linux 用 xdg-open。
			const cmd =
				process.platform === "win32"
					? `start "" "${url}"`
					: process.platform === "darwin"
						? `open "${url}"`
						: `xdg-open "${url}"`;
			exec(cmd, () => {});
		}

		process.on("SIGINT", () => {
			console.log("\n  预览服务已停止。\n");
			server.close(() => process.exit(0));
			// 兜底：有长连接挂住时 close 不会回调，别让用户卡在窗口里。
			setTimeout(() => process.exit(0), 500);
		});
	});

	server.listen(port, HOST);
}

listen(START_PORT, 1);
