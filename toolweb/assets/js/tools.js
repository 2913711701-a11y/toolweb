/**
 * ToolWeb 内置工具引擎（12 款）。
 *
 * 全部算法在浏览器本地执行，不产生任何网络请求。
 * 每个工具的 key 必须与 content/tools.js 中的 slug 一一对应 —— build.js 会在构建时校验这一点。
 */
(function () {
	"use strict";

	var TW = window.ToolWeb || {};
	var i18n = TW.i18n || {};
	var qs = TW.qs;
	var qsa = TW.qsa;
	var copy = TW.copy;
	var toast = TW.toast;

	/* =====================================================================
	 * 通用 DOM 助手
	 * ================================================================== */

	function el(tag, attrs, children) {
		var node = document.createElement(tag);

		if (attrs) {
			Object.keys(attrs).forEach(function (key) {
				var value = attrs[key];
				if (key === "class") {
					node.className = value;
				} else if (key === "text") {
					node.textContent = value;
				} else if (key.indexOf("on") === 0) {
					node.addEventListener(key.slice(2).toLowerCase(), value);
				} else if (value === true) {
					node.setAttribute(key, "");
				} else if (value !== false && value !== null && value !== undefined) {
					node.setAttribute(key, value);
				}
			});
		}

		(children || []).forEach(function (child) {
			if (child === null || child === undefined) {
				return;
			}
			node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
		});

		return node;
	}

	function labeled(labelText, control, hint) {
		return el("label", { class: "tw-tool__field" }, [
			labelText ? el("span", { class: "tw-tool__label", text: labelText }) : null,
			control,
			hint ? el("span", { class: "tw-tool__hint", text: hint }) : null,
		]);
	}

	function textarea(placeholder, rows, readonly) {
		var node = el("textarea", {
			class: "tw-textarea",
			placeholder: placeholder || "",
			rows: rows || 10,
			spellcheck: "false",
		});
		if (readonly) {
			node.readOnly = true;
		}
		return node;
	}

	function input(placeholder, type) {
		return el("input", {
			class: "tw-input",
			type: type || "text",
			placeholder: placeholder || "",
			spellcheck: "false",
		});
	}

	function numberInput(value, min, max) {
		return el("input", {
			class: "tw-input tw-input--number",
			type: "number",
			value: value,
			min: min,
			max: max,
		});
	}

	function select(options, value) {
		var node = el("select", { class: "tw-tool__select" });
		options.forEach(function (option) {
			var item = el("option", { value: option[0], text: option[1] });
			if (option[0] === value) {
				item.selected = true;
			}
			node.appendChild(item);
		});
		return node;
	}

	function checkbox(text) {
		var box = el("input", { type: "checkbox" });
		return { box: box, node: el("label", { class: "tw-tool__check" }, [box, el("span", { text: text })]) };
	}

	function button(label, variant, onClick) {
		return el(
			"button",
			{ type: "button", class: "tw-btn tw-btn--sm " + (variant || "tw-btn--primary"), onclick: onClick },
			[label]
		);
	}

	function actions(children) {
		return el("div", { class: "tw-tool__actions" }, children);
	}

	function grid(children) {
		return el("div", { class: "tw-tool__grid" }, children);
	}

	function options(children) {
		return el("div", { class: "tw-tool__options" }, children);
	}

	function statusLine() {
		return el("p", { class: "tw-tool__status", role: "status" });
	}

	function setStatus(node, text, type) {
		node.textContent = text || "";
		node.className = "tw-tool__status" + (type ? " is-" + type : "");
	}

	function byteLength(str) {
		if (!str) {
			return 0;
		}
		try {
			return new TextEncoder().encode(str).length;
		} catch (error) {
			return str.length;
		}
	}

	function debounce(fn, wait) {
		var timer = null;
		return function () {
			var args = arguments;
			var self = this;
			window.clearTimeout(timer);
			timer = window.setTimeout(function () {
				fn.apply(self, args);
			}, wait);
		};
	}

	function copyButton(getValue) {
		return button(i18n.copy || "复制", "tw-btn--ghost", function () {
			var value = getValue();
			if (!value) {
				toast(i18n.empty || "请输入内容", "err");
				return;
			}
			copy(value).then(function (ok) {
				toast(ok ? i18n.copied || "已复制" : i18n.copyFail || "复制失败", ok ? "ok" : "err");
			});
		});
	}

	/* =====================================================================
	 * 通用算法
	 * ================================================================== */

	function base64Encode(str, urlsafe) {
		var bytes = new TextEncoder().encode(str);
		var binary = "";
		var chunk = 0x8000;

		for (var i = 0; i < bytes.length; i += chunk) {
			binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
		}

		var out = window.btoa(binary);
		if (urlsafe) {
			out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		}
		return out;
	}

	function base64Decode(str) {
		var clean = String(str).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
		while (clean.length % 4) {
			clean += "=";
		}

		var binary = window.atob(clean);
		var bytes = new Uint8Array(binary.length);
		for (var i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	}

	/** 生成 [0, max) 区间内的随机整数，使用加密源且无模偏差。 */
	function randomInt(max) {
		if (window.crypto && window.crypto.getRandomValues && window.crypto.getRandomValues.length) {
			var limit = Math.floor(4294967296 / max) * max;
			var buffer = new Uint32Array(1);
			var guard = 0;
			do {
				window.crypto.getRandomValues(buffer);
				guard++;
			} while (buffer[0] >= limit && guard < 100);
			return buffer[0] % max;
		}
		return Math.floor(Math.random() * max);
	}

	function uuidV4() {
		if (window.crypto && window.crypto.randomUUID) {
			return window.crypto.randomUUID();
		}

		var bytes = new Uint8Array(16);
		if (window.crypto && window.crypto.getRandomValues) {
			window.crypto.getRandomValues(bytes);
		} else {
			for (var j = 0; j < 16; j++) {
				bytes[j] = Math.floor(Math.random() * 256);
			}
		}

		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;

		var hex = [];
		for (var i = 0; i < 16; i++) {
			hex.push((bytes[i] + 0x100).toString(16).slice(1));
		}

		return [
			hex.slice(0, 4).join(""),
			hex.slice(4, 6).join(""),
			hex.slice(6, 8).join(""),
			hex.slice(8, 10).join(""),
			hex.slice(10, 16).join(""),
		].join("-");
	}

	function hexFromBuffer(buffer) {
		var bytes = new Uint8Array(buffer);
		var out = "";
		for (var i = 0; i < bytes.length; i++) {
			out += (bytes[i] + 0x100).toString(16).slice(1);
		}
		return out;
	}

	function parseColor(value) {
		var text = String(value).trim().toLowerCase();
		var hexMatch = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);

		if (hexMatch) {
			var hex = hexMatch[1];
			if (hex.length === 3) {
				hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
			}
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
			};
		}

		var rgbMatch = text.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/);
		if (rgbMatch) {
			return {
				r: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[1])))),
				g: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[2])))),
				b: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[3])))),
			};
		}

		return null;
	}

	function rgbToHsl(r, g, b) {
		r /= 255;
		g /= 255;
		b /= 255;

		var max = Math.max(r, g, b);
		var min = Math.min(r, g, b);
		var delta = max - min;
		var l = (max + min) / 2;
		var h = 0;
		var s = 0;

		if (delta !== 0) {
			s = delta / (1 - Math.abs(2 * l - 1));
			if (max === r) {
				h = 60 * (((g - b) / delta) % 6);
			} else if (max === g) {
				h = 60 * ((b - r) / delta + 2);
			} else {
				h = 60 * ((r - g) / delta + 4);
			}
		}

		if (h < 0) {
			h += 360;
		}

		return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
	}

	/** 把 YYYY-MM-DD 解析为 UTC 时间戳，避免时区误差。 */
	function parseDateValue(value) {
		if (!value) {
			return null;
		}
		var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (!match) {
			return null;
		}
		return Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
	}

	function formatDate(date) {
		var pad = function (n) {
			return (n < 10 ? "0" : "") + n;
		};
		return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate());
	}

	var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

	/* =====================================================================
	 * 工具定义（key 与 content/tools.js 的 slug 一致）
	 * ================================================================== */
	var registry = {};

	/* ------------------------------ JSON ------------------------------- */
	registry.json = {
		build: function (root) {
			var source = textarea("在此粘贴 JSON 文本…", 14);
			var result = textarea("格式化结果将显示在这里…", 14, true);
			var status = statusLine();

			function run(mode) {
				var raw = source.value.trim();

				if (!raw) {
					result.value = "";
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}

				try {
					var value = JSON.parse(raw);
					var space = mode === "min" ? 0 : mode === "4" ? 4 : 2;
					result.value = JSON.stringify(value, null, space);

					var kind = value === null ? "null" : Array.isArray(value) ? "Array" : typeof value;
					setStatus(
						status,
						"✅ 校验通过 · 顶层类型 " + kind + " · 输出 " + byteLength(result.value) + " 字节",
						"ok"
					);
				} catch (error) {
					result.value = "";
					setStatus(status, "❌ 解析失败：" + error.message, "err");
				}
			}

			source.addEventListener(
				"input",
				debounce(function () {
					if (source.value.trim()) {
						run("pretty2");
					}
				}, 400)
			);

			root.appendChild(
				grid([labeled("输入", source, "支持对象、数组等任意合法 JSON"), labeled("输出", result, "")])
			);
			root.appendChild(
				actions([
					button("格式化", "", function () {
						run("pretty2");
					}),
					button("四空格缩进", "tw-btn--ghost", function () {
						run("4");
					}),
					button("压缩", "tw-btn--ghost", function () {
						run("min");
					}),
					button("清空", "tw-btn--ghost", function () {
						source.value = "";
						result.value = "";
						setStatus(status, "", "");
					}),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			return {
				reset: function () {
					source.value = "";
					result.value = "";
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ----------------------------- Base64 ------------------------------ */
	registry.base64 = {
		build: function (root) {
			var source = textarea("输入原文或 Base64 字符串…", 10);
			var result = textarea("结果将显示在这里…", 10, true);
			var status = statusLine();
			var urlsafe = checkbox("URL 安全字符集（输出使用 - _ 并移除 = 补位）");

			function encode() {
				if (!source.value) {
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}
				try {
					result.value = base64Encode(source.value, urlsafe.box.checked);
					setStatus(status, "✅ 编码完成 · " + byteLength(result.value) + " 字节", "ok");
				} catch (error) {
					setStatus(status, "❌ 编码失败：" + error.message, "err");
				}
			}

			function decode() {
				if (!source.value) {
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}
				try {
					result.value = base64Decode(source.value);
					setStatus(status, "✅ 解码完成 · " + result.value.length + " 个字符", "ok");
				} catch (error) {
					result.value = "";
					setStatus(status, "❌ 不是合法的 Base64 字符串", "err");
				}
			}

			root.appendChild(grid([labeled("输入", source, ""), labeled("输出", result, "")]));
			root.appendChild(options([urlsafe.node]));
			root.appendChild(
				actions([
					button("编码", "", encode),
					button("解码", "tw-btn--ghost", decode),
					button("清空", "tw-btn--ghost", function () {
						source.value = "";
						result.value = "";
						setStatus(status, "", "");
					}),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			return {
				reset: function () {
					source.value = "";
					result.value = "";
					urlsafe.box.checked = false;
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ------------------------------- URL ------------------------------- */
	registry.url = {
		build: function (root) {
			var source = textarea("粘贴链接或文本，例如 https://example.com/搜索?q=中文 空格", 8);
			var result = textarea("结果将显示在这里…", 8, true);
			var status = statusLine();
			var whole = checkbox("整体链接模式（保留 : / ? & = 等分隔符）");

			function encode() {
				if (!source.value) {
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}
				try {
					result.value = whole.box.checked
						? window.encodeURI(source.value)
						: window.encodeURIComponent(source.value);
					setStatus(status, "✅ 编码完成", "ok");
				} catch (error) {
					setStatus(status, "❌ 编码失败：" + error.message, "err");
				}
			}

			function decode() {
				if (!source.value) {
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}
				try {
					result.value = whole.box.checked
						? window.decodeURI(source.value)
						: window.decodeURIComponent(source.value);
					setStatus(status, "✅ 解码完成", "ok");
				} catch (error) {
					setStatus(status, "❌ 解码失败：存在不合法的百分号转义", "err");
				}
			}

			root.appendChild(grid([labeled("输入", source, ""), labeled("输出", result, "")]));
			root.appendChild(options([whole.node]));
			root.appendChild(
				actions([
					button("编码", "", encode),
					button("解码", "tw-btn--ghost", decode),
					button("清空", "tw-btn--ghost", function () {
						source.value = "";
						result.value = "";
						setStatus(status, "", "");
					}),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			return {
				reset: function () {
					source.value = "";
					result.value = "";
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ------------------------------- 哈希 ------------------------------ */
	registry.hash = {
		build: function (root) {
			var source = textarea("输入需要计算摘要的文本…", 8);
			var algorithm = select(
				[
					["SHA-256", "SHA-256（推荐）"],
					["SHA-1", "SHA-1"],
					["SHA-384", "SHA-384"],
					["SHA-512", "SHA-512"],
				],
				"SHA-256"
			);
			var result = textarea("摘要结果…", 4, true);
			var status = statusLine();

			function supported() {
				return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);
			}

			function run() {
				if (!supported()) {
					setStatus(status, "❌ 当前环境不支持 Web Crypto，请通过 HTTPS 访问", "err");
					return;
				}
				if (!source.value) {
					result.value = "";
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}

				var data = new TextEncoder().encode(source.value);
				window.crypto.subtle.digest(algorithm.value, data).then(
					function (buffer) {
						result.value = hexFromBuffer(buffer);
						setStatus(status, "✅ " + algorithm.value + " · " + result.value.length + " 位十六进制", "ok");
					},
					function () {
						setStatus(status, "❌ 计算失败", "err");
					}
				);
			}

			algorithm.addEventListener("change", run);
			source.addEventListener("input", debounce(run, 350));

			root.appendChild(labeled("算法", algorithm, "摘要算法越强，碰撞概率越低"));
			root.appendChild(labeled("输入文本", source, ""));
			root.appendChild(labeled("输出摘要（小写十六进制）", result, ""));
			root.appendChild(
				actions([
					button("计算", "", run),
					button("清空", "tw-btn--ghost", function () {
						source.value = "";
						result.value = "";
						setStatus(status, "", "");
					}),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			return {
				reset: function () {
					source.value = "";
					result.value = "";
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ------------------------------ 密码 ------------------------------ */
	registry.password = {
		build: function (root) {
			var length = numberInput(20, 4, 128);
			var amount = numberInput(1, 1, 20);
			var upper = checkbox("大写字母 A-Z");
			var lower = checkbox("小写字母 a-z");
			var digits = checkbox("数字 0-9");
			var symbols = checkbox("特殊符号");
			var noAmbiguous = checkbox("排除易混淆字符 il1Lo0O");
			var result = textarea("生成的密码…", 6, true);
			var meter = el("div", { class: "tw-meter" }, [el("span", { class: "tw-meter__bar" })]);
			var status = statusLine();

			upper.box.checked = true;
			lower.box.checked = true;
			digits.box.checked = true;
			symbols.box.checked = true;

			function buildGroups() {
				var ambiguous = "il1Lo0O";
				var groups = [];

				function add(chars) {
					if (noAmbiguous.box.checked) {
						chars = chars
							.split("")
							.filter(function (ch) {
								return ambiguous.indexOf(ch) === -1;
							})
							.join("");
					}
					if (chars.length) {
						groups.push(chars);
					}
				}

				if (upper.box.checked) {
					add("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
				}
				if (lower.box.checked) {
					add("abcdefghijklmnopqrstuvwxyz");
				}
				if (digits.box.checked) {
					add("0123456789");
				}
				if (symbols.box.checked) {
					add("!@#$%^&*()-_=+[]{};:,.?/");
				}

				return groups;
			}

			function strengthLabel(entropy) {
				if (entropy >= 110) {
					return ["非常强", "is-strong"];
				}
				if (entropy >= 75) {
					return ["强", "is-good"];
				}
				if (entropy >= 50) {
					return ["中等", "is-fair"];
				}
				return ["偏弱", "is-weak"];
			}

			function generate() {
				var groups = buildGroups();

				if (!groups.length) {
					setStatus(status, "❌ 请至少选择一种字符类型", "err");
					result.value = "";
					return;
				}

				var pool = groups.join("");
				var count = Math.max(1, Math.min(20, parseInt(amount.value, 10) || 1));
				var size = Math.max(4, Math.min(128, parseInt(length.value, 10) || 16));
				var lines = [];

				// 长度不足以覆盖每类字符时，自动抬到下限。
				if (size < groups.length) {
					size = groups.length;
				}

				for (var i = 0; i < count; i++) {
					var chars = [];

					// 先保证每个已选类型至少出现一次，再随机补足长度。
					groups.forEach(function (group) {
						chars.push(group.charAt(randomInt(group.length)));
					});

					while (chars.length < size) {
						chars.push(pool.charAt(randomInt(pool.length)));
					}

					// Fisher–Yates 洗牌，避免类型字符集中在开头。
					for (var k = chars.length - 1; k > 0; k--) {
						var swap = randomInt(k + 1);
						var tmp = chars[k];
						chars[k] = chars[swap];
						chars[swap] = tmp;
					}

					lines.push(chars.join(""));
				}

				result.value = lines.join("\n");

				var entropy = size * (Math.log(pool.length) / Math.log(2));
				var label = strengthLabel(entropy);
				var ratio = Math.max(4, Math.min(100, Math.round((entropy / 130) * 100)));

				meter.className = "tw-meter " + label[1];
				meter.firstChild.style.width = ratio + "%";

				setStatus(
					status,
					"✅ 强度：" + label[0] + " · 字符集 " + pool.length + " 个 · 熵约 " + Math.round(entropy) + " bit",
					"ok"
				);
			}

			root.appendChild(
				grid([
					labeled("密码长度", length, "建议 16 位以上"),
					labeled("生成数量", amount, "最多 20 条，每行一条"),
				])
			);
			root.appendChild(options([upper.node, lower.node, digits.node, symbols.node, noAmbiguous.node]));
			root.appendChild(labeled("生成结果", result, ""));
			root.appendChild(meter);
			root.appendChild(
				actions([
					button("生成密码", "", generate),
					button("重新生成", "tw-btn--ghost", generate),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			generate();

			return {
				reset: function () {
					length.value = 20;
					amount.value = 1;
					upper.box.checked = true;
					lower.box.checked = true;
					digits.box.checked = true;
					symbols.box.checked = true;
					noAmbiguous.box.checked = false;
					generate();
				},
			};
		},
	};

	/* ------------------------------ UUID ------------------------------ */
	registry.uuid = {
		build: function (root) {
			var amount = numberInput(10, 1, 500);
			var uppercase = checkbox("大写输出");
			var stripDash = checkbox("去掉连字符");
			var result = textarea("生成的 UUID…", 12, true);
			var status = statusLine();

			function generate() {
				var count = Math.max(1, Math.min(500, parseInt(amount.value, 10) || 1));
				var lines = [];

				for (var i = 0; i < count; i++) {
					var value = uuidV4();
					if (stripDash.box.checked) {
						value = value.replace(/-/g, "");
					}
					if (uppercase.box.checked) {
						value = value.toUpperCase();
					}
					lines.push(value);
				}

				result.value = lines.join("\n");
				setStatus(status, "✅ 已生成 " + count + " 个 UUID v4", "ok");
			}

			root.appendChild(grid([labeled("生成数量", amount, "单次最多 500 个")]));
			root.appendChild(options([uppercase.node, stripDash.node]));
			root.appendChild(labeled("生成结果", result, ""));
			root.appendChild(
				actions([
					button("生成", "", generate),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			generate();

			return {
				reset: function () {
					amount.value = 10;
					uppercase.box.checked = false;
					stripDash.box.checked = false;
					generate();
				},
			};
		},
	};

	/* ---------------------------- 时间戳 ------------------------------ */
	registry.timestamp = {
		build: function (root) {
			var stampInput = input("例如 1735689600 或 1735689600000", "text");
			var dateOutput = textarea("转换结果…", 4, true);
			var localInput = el("input", { class: "tw-input", type: "datetime-local" });
			var stampOutput = textarea("对应时间戳…", 3, true);
			var status = statusLine();

			function fromStamp() {
				var raw = String(stampInput.value).trim();

				if (!raw) {
					setStatus(status, i18n.empty || "请输入内容", "warn");
					return;
				}
				if (!/^-?\d+(\.\d+)?$/.test(raw)) {
					setStatus(status, "❌ 请输入纯数字时间戳", "err");
					dateOutput.value = "";
					return;
				}

				var value = Number(raw);
				var isSeconds = raw.replace("-", "").length <= 10;
				var date = new Date(isSeconds ? value * 1000 : value);

				if (isNaN(date.getTime())) {
					setStatus(status, "❌ 无法解析该时间戳", "err");
					return;
				}

				dateOutput.value = [
					"本地时间： " + date.toLocaleString("zh-CN", { hour12: false }),
					"UTC 时间：" + date.toUTCString(),
					"ISO 8601：" + date.toISOString(),
					"星期：    " + WEEKDAYS[date.getDay()],
				].join("\n");

				setStatus(status, "✅ 已按「" + (isSeconds ? "秒" : "毫秒") + "」单位解析", "ok");
			}

			function fromDate() {
				if (!localInput.value) {
					setStatus(status, i18n.empty || "请选择日期时间", "warn");
					return;
				}

				var date = new Date(localInput.value);
				if (isNaN(date.getTime())) {
					setStatus(status, "❌ 日期无效", "err");
					return;
				}

				stampOutput.value = [
					"秒级：  " + Math.floor(date.getTime() / 1000),
					"毫秒级：" + date.getTime(),
					"UTC：   " + date.toISOString(),
				].join("\n");

				setStatus(status, "✅ 已按本地时区转换", "ok");
			}

			function pad(n) {
				return (n < 10 ? "0" : "") + n;
			}

			function fillNowToDate() {
				var now = new Date();
				localInput.value =
					now.getFullYear() +
					"-" +
					pad(now.getMonth() + 1) +
					"-" +
					pad(now.getDate()) +
					"T" +
					pad(now.getHours()) +
					":" +
					pad(now.getMinutes());
				fromDate();
			}

			root.appendChild(labeled("时间戳 → 日期", stampInput, "自动识别 10 位（秒）与 13 位（毫秒）"));
			root.appendChild(
				actions([
					button("转换为日期", "", fromStamp),
					button("使用当前时间", "tw-btn--ghost", function () {
						stampInput.value = String(Math.floor(Date.now() / 1000));
						fromStamp();
					}),
					copyButton(function () {
						return dateOutput.value;
					}),
				])
			);
			root.appendChild(labeled("日期结果", dateOutput, ""));

			root.appendChild(labeled("日期 → 时间戳", localInput, "选择本地时间即可换算"));
			root.appendChild(
				actions([
					button("转换为时间戳", "", fromDate),
					button("填入当前时间", "tw-btn--ghost", fillNowToDate),
					copyButton(function () {
						return stampOutput.value;
					}),
				])
			);
			root.appendChild(labeled("时间戳结果", stampOutput, ""));
			root.appendChild(status);

			return {
				reset: function () {
					stampInput.value = "";
					dateOutput.value = "";
					localInput.value = "";
					stampOutput.value = "";
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ---------------------------- 日期计算 ---------------------------- */
	registry.datecalc = {
		build: function (root) {
			var start = el("input", { class: "tw-input", type: "date" });
			var end = el("input", { class: "tw-input", type: "date" });
			var diffResult = textarea("相差结果…", 5, true);
			var diffStatus = statusLine();

			var baseDate = el("input", { class: "tw-input", type: "date" });
			var delta = numberInput(30, -100000, 100000);
			var shiftResult = textarea("推算结果…", 3, true);
			var shiftStatus = statusLine();

			/** 统计区间内的工作日数量（不含周末）。 */
			function countWorkdays(from, to) {
				var days = 0;
				var cursor = from;
				while (cursor < to) {
					cursor += 86400000;
					var day = new Date(cursor).getUTCDay();
					if (day !== 0 && day !== 6) {
						days++;
					}
				}
				return days;
			}

			function runDiff() {
				var a = parseDateValue(start.value);
				var b = parseDateValue(end.value);

				if (a === null || b === null) {
					setStatus(diffStatus, "请选择两个日期", "warn");
					return;
				}

				var from = Math.min(a, b);
				var to = Math.max(a, b);
				var days = Math.round((to - from) / 86400000);

				diffResult.value = [
					"相差天数：  " + days + " 天",
					"约合：      " + Math.floor(days / 7) + " 周 " + (days % 7) + " 天",
					"工作日数：  " + countWorkdays(from, to) + " 天（不含周末）",
					"包含月份：  约 " + (days / 30.4375).toFixed(1) + " 个月",
					"时间方向：  " + (b >= a ? "终点在起点之后" : "终点在起点之前"),
				].join("\n");

				setStatus(diffStatus, "✅ 计算完成", "ok");
			}

			function runShift() {
				var baseTime = parseDateValue(baseDate.value);
				if (baseTime === null) {
					setStatus(shiftStatus, "请选择起始日期", "warn");
					return;
				}

				var days = parseInt(delta.value, 10) || 0;
				var target = new Date(baseTime + days * 86400000);

				shiftResult.value = [
					"结果日期： " + formatDate(target),
					"星期：     " + WEEKDAYS[target.getUTCDay()],
					"偏移：     " + (days >= 0 ? "+" : "") + days + " 天",
				].join("\n");

				setStatus(shiftStatus, "✅ 推算完成", "ok");
			}

			root.appendChild(el("h3", { class: "tw-tool__subtitle", text: "两个日期的间隔" }));
			root.appendChild(grid([labeled("开始日期", start, ""), labeled("结束日期", end, "")]));
			root.appendChild(
				actions([
					button("计算相差", "", runDiff),
					copyButton(function () {
						return diffResult.value;
					}),
				])
			);
			root.appendChild(labeled("相差结果", diffResult, ""));
			root.appendChild(diffStatus);

			root.appendChild(el("h3", { class: "tw-tool__subtitle", text: "日期推算" }));
			root.appendChild(grid([labeled("基准日期", baseDate, ""), labeled("偏移天数（可为负）", delta, "")]));
			root.appendChild(
				actions([
					button("推算日期", "", runShift),
					copyButton(function () {
						return shiftResult.value;
					}),
				])
			);
			root.appendChild(labeled("推算结果", shiftResult, ""));
			root.appendChild(shiftStatus);

			return {
				reset: function () {
					start.value = "";
					end.value = "";
					baseDate.value = "";
					delta.value = 30;
					diffResult.value = "";
					shiftResult.value = "";
					setStatus(diffStatus, "", "");
					setStatus(shiftStatus, "", "");
				},
			};
		},
	};

	/* ----------------------------- 进制转换 ---------------------------- */
	registry.radix = {
		build: function (root) {
			var uppercase = checkbox("十六进制大写输出");
			var status = statusLine();

			uppercase.box.checked = true;

			var fields = [
				{ node: input("二进制", "text"), radix: 2 },
				{ node: input("八进制", "text"), radix: 8 },
				{ node: input("十进制", "text"), radix: 10 },
				{ node: input("十六进制", "text"), radix: 16 },
			];

			function convert(sourceNode) {
				var raw = String(sourceNode.value).trim().replace(/\s+/g, "");

				if (!raw) {
					fields.forEach(function (field) {
						field.node.value = "";
					});
					setStatus(status, "", "");
					return;
				}

				var source = null;
				fields.forEach(function (field) {
					if (field.node === sourceNode) {
						source = field;
					}
				});
				if (!source) {
					return;
				}

				var normalized = raw.replace(/^0[bBoOxX]/, "");
				var negative = normalized.indexOf("-") === -1 ? 1 : -1;
				normalized = normalized.replace(/-/g, "");

				var value = parseInt(normalized, source.radix);
				if (isNaN(value) || !isFinite(value)) {
					setStatus(status, "❌ 「" + raw + "」不是合法的 " + source.radix + " 进制数字", "err");
					return;
				}

				fields.forEach(function (field) {
					if (field.node === sourceNode) {
						return;
					}
					var text = (negative * value).toString(field.radix);
					field.node.value = field.radix === 16 && uppercase.box.checked ? text.toUpperCase() : text;
				});

				setStatus(status, "✅ 十进制值 " + negative * value, "ok");
			}

			fields.forEach(function (field) {
				field.node.addEventListener("input", function () {
					convert(field.node);
				});
			});

			uppercase.box.addEventListener("change", function () {
				if (fields[3].node.value) {
					convert(fields[2].node.value ? fields[2].node : fields[3].node);
				}
			});

			root.appendChild(
				grid([
					labeled("二进制（2）", fields[0].node, ""),
					labeled("八进制（8）", fields[1].node, ""),
					labeled("十进制（10）", fields[2].node, ""),
					labeled("十六进制（16）", fields[3].node, ""),
				])
			);
			root.appendChild(options([uppercase.node]));
			root.appendChild(status);

			return {
				reset: function () {
					fields.forEach(function (field) {
						field.node.value = "";
					});
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ----------------------------- 文本工具 ---------------------------- */
	registry.text = {
		build: function (root) {
			var source = textarea("粘贴需要处理的文本…", 12);
			var stats = el("dl", { class: "tw-stats" });
			var status = statusLine();

			function update() {
				var value = source.value;
				var lines = value ? value.split(/\r\n|\r|\n/) : [];
				var words = value.trim() ? value.trim().split(/\s+/).length : 0;

				stats.innerHTML = "";

				[
					["字符数", value.length],
					["字符数（不含空格）", value.replace(/\s/g, "").length],
					["单词数", words],
					["行数", lines.length],
					["UTF-8 字节", byteLength(value)],
				].forEach(function (pair) {
					stats.appendChild(
						el("div", { class: "tw-stats__item" }, [
							el("dt", { text: pair[0] }),
							el("dd", { text: String(pair[1]) }),
						])
					);
				});
			}

			function transform(fn) {
				source.value = fn(source.value);
				update();
				setStatus(status, "✅ 已处理", "ok");
			}

			source.addEventListener("input", update);

			root.appendChild(labeled("文本内容", source, ""));
			root.appendChild(
				actions([
					button("全部大写", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.toUpperCase();
						});
					}),
					button("全部小写", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.toLowerCase();
						});
					}),
					button("首字母大写", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.replace(/\b([a-z])/g, function (m) {
								return m.toUpperCase();
							});
						});
					}),
					button("反转字符", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.split("").reverse().join("");
						});
					}),
					button("反转行序", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.split("\n").reverse().join("\n");
						});
					}),
					button("按行排序", "tw-btn--ghost", function () {
						transform(function (t) {
							return t
								.split("\n")
								.sort(function (a, b) {
									return a.localeCompare(b, "zh-CN");
								})
								.join("\n");
						});
					}),
					button("去除重复行", "tw-btn--ghost", function () {
						transform(function (t) {
							var seen = {};
							return t
								.split("\n")
								.filter(function (line) {
									if (seen[line]) {
										return false;
									}
									seen[line] = true;
									return true;
								})
								.join("\n");
						});
					}),
					button("删除空行", "tw-btn--ghost", function () {
						transform(function (t) {
							return t
								.split("\n")
								.filter(function (line) {
									return line.trim() !== "";
								})
								.join("\n");
						});
					}),
					button("压缩多余空格", "tw-btn--ghost", function () {
						transform(function (t) {
							return t.replace(/[ \t]+/g, " ").replace(/^ | $/gm, "");
						});
					}),
					button("清空", "tw-btn--ghost", function () {
						source.value = "";
						update();
						setStatus(status, "", "");
					}),
					copyButton(function () {
						return source.value;
					}),
				])
			);
			root.appendChild(
				el("div", { class: "tw-tool__field" }, [
					el("span", { class: "tw-tool__label", text: "实时统计" }),
					stats,
				])
			);
			root.appendChild(status);

			update();

			return {
				reset: function () {
					source.value = "";
					update();
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ----------------------------- 正则测试 ---------------------------- */
	registry.regex = {
		build: function (root) {
			var pattern = input("例如 \\d{4}-\\d{2}-\\d{2}", "text");
			var text = textarea("在此粘贴需要匹配的文本…", 10);
			var highlight = el("div", { class: "tw-regex__preview" });
			var groups = el("div", { class: "tw-regex__groups" });
			var status = statusLine();

			var flagBoxes = {};
			var FLAG_TIPS = {
				g: "g 全局匹配",
				i: "i 忽略大小写",
				m: "m 多行模式",
				s: "s 点号匹配换行",
				u: "u Unicode",
			};

			["g", "i", "m", "s", "u"].forEach(function (flag) {
				var item = checkbox(FLAG_TIPS[flag]);
				item.box.checked = flag === "g" || flag === "i";
				flagBoxes[flag] = item;
			});

			function flags() {
				return Object.keys(flagBoxes)
					.filter(function (flag) {
						return flagBoxes[flag].box.checked;
					})
					.join("");
			}

			function run() {
				var body = pattern.value;
				highlight.innerHTML = "";
				groups.innerHTML = "";

				if (!body) {
					setStatus(status, "", "");
					return;
				}

				var re;
				try {
					re = new RegExp(body, flags());
				} catch (error) {
					setStatus(status, "❌ 正则语法错误：" + error.message, "err");
					return;
				}

				var source = text.value;
				var matches = [];
				var guard = 0;
				var match;

				if (re.global) {
					while ((match = re.exec(source)) !== null && guard < 5000) {
						matches.push(match);
						if (match[0] === "") {
							re.lastIndex++;
						}
						guard++;
					}
				} else {
					match = re.exec(source);
					if (match) {
						matches.push(match);
					}
				}

				// 高亮预览。
				var cursor = 0;
				matches.forEach(function (item) {
					var index = item.index;
					var length = item[0].length;

					if (index > cursor) {
						highlight.appendChild(document.createTextNode(source.slice(cursor, index)));
					}

					highlight.appendChild(el("mark", { text: item[0] || "(空匹配)" }));
					highlight.appendChild(el("span", { class: "tw-regex__idx", text: String(index) }));

					cursor = index + length;
				});

				if (cursor < source.length) {
					highlight.appendChild(document.createTextNode(source.slice(cursor)));
				}

				// 捕获分组（最多展示 30 条）。
				matches.slice(0, 30).forEach(function (item, index) {
					if (item.length < 2) {
						return;
					}

					var line = el("div", { class: "tw-regex__group" }, [
						el("span", { class: "tw-regex__group-no", text: "#" + (index + 1) }),
					]);

					for (var i = 1; i < item.length; i++) {
						line.appendChild(
							el("span", {
								class: "tw-regex__group-val",
								text: "$" + i + " = " + (item[i] === undefined ? "未匹配" : item[i]),
							})
						);
					}

					groups.appendChild(line);
				});

				setStatus(
					status,
					matches.length ? "✅ 匹配到 " + matches.length + " 处" : "未匹配到任何内容",
					matches.length ? "ok" : "warn"
				);
			}

			var lazy = debounce(run, 300);
			pattern.addEventListener("input", lazy);
			text.addEventListener("input", lazy);

			Object.keys(flagBoxes).forEach(function (flag) {
				flagBoxes[flag].box.addEventListener("change", run);
			});

			root.appendChild(labeled("正则表达式", pattern, "不需要输入两侧的斜杠"));
			root.appendChild(
				options(
					Object.keys(flagBoxes).map(function (flag) {
						return flagBoxes[flag].node;
					})
				)
			);
			root.appendChild(labeled("测试文本", text, ""));
			root.appendChild(
				el("div", { class: "tw-tool__field" }, [
					el("span", { class: "tw-tool__label", text: "匹配高亮" }),
					highlight,
				])
			);
			root.appendChild(
				el("div", { class: "tw-tool__field" }, [
					el("span", { class: "tw-tool__label", text: "捕获分组" }),
					groups,
				])
			);
			root.appendChild(status);

			return {
				reset: function () {
					pattern.value = "";
					text.value = "";
					highlight.innerHTML = "";
					groups.innerHTML = "";
					setStatus(status, "", "");
				},
			};
		},
	};

	/* ----------------------------- 颜色转换 ---------------------------- */
	registry.color = {
		build: function (root) {
			var source = input("#2563eb", "text");
			var picker = el("input", { class: "tw-color__picker", type: "color", value: "#2563eb" });
			var swatch = el("div", { class: "tw-color__swatch" });
			var result = textarea("转换结果…", 7, true);
			var status = statusLine();

			function toHex(r, g, b) {
				var part = function (n) {
					return (n + 0x100).toString(16).slice(1);
				};
				return "#" + part(r) + part(g) + part(b);
			}

			function run() {
				var rgb = parseColor(source.value);

				if (!rgb) {
					swatch.style.background = "transparent";
					result.value = "";
					setStatus(status, "❌ 无法识别，请输入 #RRGGBB 或 rgb(r,g,b)", "err");
					return;
				}

				var hex = toHex(rgb.r, rgb.g, rgb.b);
				var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
				var luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

				swatch.style.background = hex;
				picker.value = hex;

				result.value = [
					"HEX： " + hex,
					"HEX（简写）：" +
						(hex[1] === hex[2] && hex[3] === hex[4] && hex[5] === hex[6]
							? "#" + hex[1] + hex[3] + hex[5]
							: "不适用"),
					"RGB： rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")",
					"RGBA：rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", 1)",
					"HSL： hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)",
					"相对亮度：" + luminance.toFixed(3),
					"建议文字色：" + (luminance > 0.6 ? "#111827（深色文字）" : "#ffffff（浅色文字）"),
				].join("\n");

				setStatus(status, "✅ 转换完成", "ok");
			}

			source.addEventListener("input", debounce(run, 250));

			picker.addEventListener("input", function () {
				source.value = picker.value;
				run();
			});

			root.appendChild(
				grid([
					labeled("颜色值", source, "支持 HEX、RGB、RGBA 输入"),
					labeled("取色器", picker, "点击选择颜色"),
				])
			);
			root.appendChild(
				el("div", { class: "tw-tool__field" }, [
					el("span", { class: "tw-tool__label", text: "预览" }),
					swatch,
				])
			);
			root.appendChild(labeled("转换结果", result, ""));
			root.appendChild(
				actions([
					button("转换", "", run),
					copyButton(function () {
						return result.value;
					}),
				])
			);
			root.appendChild(status);

			run();

			return {
				reset: function () {
					source.value = "#2563eb";
					run();
				},
			};
		},
	};

	/* =====================================================================
	 * 挂载
	 * ================================================================== */
	function mount() {
		qsa('[data-role="tool-app"]').forEach(function (app) {
			var slug = app.getAttribute("data-tool");
			var body = qs('[data-role="tool-body"]', app);
			var definition = registry[slug];

			if (!body) {
				return;
			}

			if (!definition) {
				body.innerHTML = "";
				body.appendChild(el("p", { class: "tw-tool__notice", text: "该工具暂不可用。" }));
				return;
			}

			body.innerHTML = "";

			var api;
			try {
				api = definition.build(body) || {};
			} catch (error) {
				body.appendChild(el("p", { class: "tw-tool__notice", text: "工具初始化失败：" + error.message }));
				return;
			}

			var resetButton = qs('[data-role="tool-reset"]', app);
			if (resetButton && typeof api.reset === "function") {
				resetButton.addEventListener("click", function () {
					api.reset();
				});
			}
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mount);
	} else {
		mount();
	}
})();
