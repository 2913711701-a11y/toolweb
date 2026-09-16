/**
 * ToolWeb 静态站前端脚本。
 *
 * 纯原生 JavaScript，无任何依赖、无任何后端请求。
 * 职责：深浅色切换、移动端抽屉、全局搜索面板、客户端即时搜索、
 *      工具/网址前端筛选、复制、回到顶部。
 *
 * 搜索数据来自构建产物 assets/js/search-index.js，首次输入时才按需加载。
 */
(function () {
	"use strict";

	// 由自身脚本地址推导站点根路径，从而兼容部署在子目录的情况。
	var SELF = document.currentScript ? document.currentScript.src : "";
	var BASE = SELF.replace(/assets\/js\/main\.js.*$/, "");

	// 资源版本号由构建脚本写在 <script src="…/main.js?v=hash"> 上，这里从自身地址取出来，
	// 再拼给按需加载的 search-index.js。少了它，_headers 的 immutable 长缓存会导致
	// 站点内容更新后老访客仍然加载旧索引。
	var ASSET_V = (SELF.match(/[?&]v=([^&]*)/) || [])[1] || "";

	/** 给按需加载的资源补上版本号。 */
	function assetSrc(relativePath) {
		return BASE + relativePath + (ASSET_V ? "?v=" + ASSET_V : "");
	}

	var I18N = {
		copied: "已复制到剪贴板",
		copyFail: "复制失败，请手动选择文本",
		copy: "复制",
		noResult: "没有找到匹配的结果",
		empty: "请输入内容",
	};

	/* ---------------------------------------------------------------------
	 * 基础工具函数
	 * ------------------------------------------------------------------ */

	function qs(selector, scope) {
		return (scope || document).querySelector(selector);
	}

	function qsa(selector, scope) {
		return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
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

	function throttle(fn) {
		var queued = false;
		return function () {
			if (queued) {
				return;
			}
			queued = true;
			window.requestAnimationFrame(function () {
				queued = false;
				fn();
			});
		};
	}

	function copyText(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text).then(
				function () {
					return true;
				},
				function () {
					return legacyCopy(text);
				}
			);
		}
		return Promise.resolve(legacyCopy(text));
	}

	function legacyCopy(text) {
		var area = document.createElement("textarea");
		area.value = text;
		area.setAttribute("readonly", "readonly");
		area.style.cssText = "position:fixed;top:-1000px;opacity:0";
		document.body.appendChild(area);
		area.select();

		var ok = false;
		try {
			ok = document.execCommand("copy");
		} catch (error) {
			ok = false;
		}
		document.body.removeChild(area);
		return ok;
	}

	function toast(message, type) {
		var node = qs(".tw-toast");
		if (!node) {
			node = document.createElement("div");
			node.className = "tw-toast";
			document.body.appendChild(node);
		}
		node.textContent = message;
		node.className = "tw-toast tw-toast--" + (type || "ok") + " is-visible";

		window.clearTimeout(node._timer);
		node._timer = window.setTimeout(function () {
			node.classList.remove("is-visible");
		}, 1900);
	}

	// 暴露给 tools.js 复用。
	window.ToolWeb = Object.assign(window.ToolWeb || {}, {
		copy: copyText,
		toast: toast,
		qs: qs,
		qsa: qsa,
		i18n: I18N,
	});

	/* ---------------------------------------------------------------------
	 * 1. 深浅色模式
	 * ------------------------------------------------------------------ */
	function initThemeToggle() {
		var root = document.documentElement;
		var buttons = qsa('[data-action="theme"]');
		if (!buttons.length) {
			return;
		}

		function current() {
			return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
		}

		function apply(mode) {
			root.setAttribute("data-theme", mode);
			try {
				localStorage.setItem("toolweb-theme", mode);
			} catch (error) {
				/* 隐私模式下 localStorage 可能不可用，忽略。 */
			}
			buttons.forEach(function (button) {
				button.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
			});
		}

		apply(current());

		buttons.forEach(function (button) {
			button.addEventListener("click", function () {
				apply(current() === "dark" ? "light" : "dark");
			});
		});
	}

	/* ---------------------------------------------------------------------
	 * 2. 移动端抽屉
	 * ------------------------------------------------------------------ */
	function initDrawer() {
		var drawer = qs("#tw-drawer");
		var triggers = qsa('[data-action="drawer"]');
		if (!drawer) {
			return;
		}

		function open() {
			drawer.hidden = false;
			document.body.classList.add("tw-locked");
			window.requestAnimationFrame(function () {
				drawer.classList.add("is-open");
			});
			triggers.forEach(function (item) {
				item.setAttribute("aria-expanded", "true");
			});
		}

		function close() {
			drawer.classList.remove("is-open");
			document.body.classList.remove("tw-locked");
			triggers.forEach(function (item) {
				item.setAttribute("aria-expanded", "false");
			});
			window.setTimeout(function () {
				drawer.hidden = true;
			}, 240);
		}

		triggers.forEach(function (item) {
			item.addEventListener("click", function () {
				if (drawer.classList.contains("is-open")) {
					close();
				} else {
					open();
				}
			});
		});

		drawer.addEventListener("keydown", function (event) {
			if (event.key === "Escape") {
				close();
			}
		});
	}

	/* ---------------------------------------------------------------------
	 * 3. 全局搜索面板
	 * ------------------------------------------------------------------ */
	function initSearchPanel() {
		var panel = qs("#tw-searchbox");
		var toggles = qsa('[data-action="search"]');
		if (!panel) {
			return;
		}

		var input = qs('[data-role="live-search"]', panel);

		function open() {
			panel.hidden = false;
			document.body.classList.add("tw-locked");
			window.requestAnimationFrame(function () {
				panel.classList.add("is-open");
			});
			toggles.forEach(function (item) {
				item.setAttribute("aria-expanded", "true");
			});
			if (input) {
				window.setTimeout(function () {
					input.focus();
				}, 60);
			}
		}

		function close() {
			panel.classList.remove("is-open");
			document.body.classList.remove("tw-locked");
			toggles.forEach(function (item) {
				item.setAttribute("aria-expanded", "false");
			});
			window.setTimeout(function () {
				panel.hidden = true;
			}, 200);
		}

		toggles.forEach(function (item) {
			item.addEventListener("click", function () {
				if (panel.classList.contains("is-open")) {
					close();
				} else {
					open();
				}
			});
		});

		panel.addEventListener("click", function (event) {
			if (event.target.closest(".tw-searchbox__backdrop")) {
				close();
			}
		});

		document.addEventListener("keydown", function (event) {
			if (event.key === "Escape" && panel.classList.contains("is-open")) {
				close();
			}
		});

		// 桌面端快捷键：/ 或 Ctrl/Cmd + K
		document.addEventListener("keydown", function (event) {
			var tag = (event.target.tagName || "").toLowerCase();
			var typing = tag === "input" || tag === "textarea" || event.target.isContentEditable;
			if (typing) {
				return;
			}
			if (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
				event.preventDefault();
				open();
			}
		});
	}

	/* ---------------------------------------------------------------------
	 * 4. 客户端即时搜索
	 * ------------------------------------------------------------------ */

	var indexState = { loaded: false, loading: false, data: null };

	/** 按需加载搜索索引，只加载一次。 */
	function loadIndex(callback) {
		if (indexState.loaded) {
			callback(indexState.data);
			return;
		}

		indexState.pending = indexState.pending || [];
		indexState.pending.push(callback);

		if (indexState.loading) {
			return;
		}
		indexState.loading = true;

		var script = document.createElement("script");
		script.src = assetSrc("assets/js/search-index.js");
		script.onload = function () {
			indexState.data = window.TW_INDEX || { tools: [], sites: [] };
			indexState.loaded = true;
			indexState.loading = false;
			indexState.pending.splice(0).forEach(function (fn) {
				fn(indexState.data);
			});
		};
		script.onerror = function () {
			indexState.loading = false;
			indexState.data = { tools: [], sites: [] };
			indexState.pending.splice(0).forEach(function (fn) {
				fn(indexState.data);
			});
		};
		document.head.appendChild(script);
	}

	/** 在索引中检索，名称命中优先。 */
	function search(index, term) {
		var terms = term.toLowerCase().split(/\s+/).filter(Boolean);
		if (!terms.length) {
			return [];
		}

		var pool = []
			.concat(index.tools.map(decorate))
			.concat(index.sites.map(decorate));

		function decorate(item) {
			return {
				title: item.t,
				url: item.u,
				desc: item.d,
				cat: item.c,
				kind: item.k,
				haystack: (item.t + " " + item.d + " " + item.c + " " + item.k).toLowerCase(),
				titleHay: item.t.toLowerCase(),
			};
		}

		return pool
			.filter(function (item) {
				return terms.every(function (one) {
					return item.haystack.indexOf(one) > -1;
				});
			})
			.map(function (item) {
				var score = 0;
				terms.forEach(function (one) {
					if (item.titleHay.indexOf(one) === 0) {
						score += 3;
					} else if (item.titleHay.indexOf(one) > -1) {
						score += 2;
					}
				});
				return Object.assign(item, { score: score });
			})
			.sort(function (a, b) {
				return b.score - a.score;
			});
	}

	function initLiveSearch() {
		var inputs = qsa('[data-role="live-search"]');
		if (!inputs.length) {
			return;
		}

		inputs.forEach(function (input) {
			var scope = input.closest("[data-search-root]") || input.parentElement;
			var box = scope ? qs('[data-role="search-results"]', scope) : null;
			if (!box) {
				return;
			}

			var form = input.closest("form");

			function render(items, term) {
				box.innerHTML = "";

				if (!items.length) {
					var empty = document.createElement("p");
					empty.className = "tw-search__none";
					empty.textContent = I18N.noResult;
					box.appendChild(empty);
					box.classList.add("is-open");
					return;
				}

				var list = document.createElement("ul");
				list.className = "tw-search__list";

				items.slice(0, 8).forEach(function (item) {
					var li = document.createElement("li");
					var a = document.createElement("a");

					a.href = /^https?:/i.test(item.url) ? item.url : BASE + item.url;
					a.className = "tw-search__item";
					if (/^https?:/i.test(item.url)) {
						a.target = "_blank";
						a.rel = "noopener nofollow";
					}

					var main = document.createElement("span");
					main.className = "tw-search__item-main";

					var title = document.createElement("span");
					title.className = "tw-search__item-title";
					title.textContent = item.title;
					main.appendChild(title);

					if (item.desc) {
						var desc = document.createElement("span");
						desc.className = "tw-search__item-desc";
						desc.textContent = item.desc;
						main.appendChild(desc);
					}

					var meta = document.createElement("span");
					meta.className = "tw-search__item-meta";
					meta.textContent = item.kind;

					a.appendChild(main);
					a.appendChild(meta);
					li.appendChild(a);
					list.appendChild(li);
				});

				box.appendChild(list);

				var all = document.createElement("a");
				all.className = "tw-search__all";
				all.href = BASE + "tools/?q=" + encodeURIComponent(term);
				all.textContent = "查看全部结果 →";
				box.appendChild(all);

				box.classList.add("is-open");
			}

			var run = debounce(function () {
				var term = input.value.trim();
				if (term.length < 1) {
					box.classList.remove("is-open");
					box.innerHTML = "";
					return;
				}

				loadIndex(function (index) {
					if (input.value.trim() !== term) {
						return;
					}
					render(search(index, term), term);
				});
			}, 160);

			input.addEventListener("input", run);

			input.addEventListener("focus", function () {
				if (input.value.trim()) {
					run();
				}
			});

			input.addEventListener("keydown", function (event) {
				if (event.key === "Escape") {
					box.classList.remove("is-open");
				}
				if (event.key === "ArrowDown") {
					var first = qs(".tw-search__item", box);
					if (first) {
						event.preventDefault();
						first.focus();
					}
				}
			});

			box.addEventListener("keydown", function (event) {
				var items = qsa(".tw-search__item, .tw-search__all", box);
				var position = items.indexOf(document.activeElement);
				if (position < 0) {
					return;
				}
				if (event.key === "ArrowDown") {
					event.preventDefault();
					(items[position + 1] || input).focus();
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					(items[position - 1] || input).focus();
				}
			});

			if (form) {
				form.addEventListener("submit", function (event) {
					event.preventDefault();
					var term = input.value.trim();
					window.location.href = BASE + "tools/" + (term ? "?q=" + encodeURIComponent(term) : "");
				});
			}
		});

		// 点击空白处收起结果。
		document.addEventListener("click", function (event) {
			qsa("[data-search-root]").forEach(function (scope) {
				if (scope.contains(event.target)) {
					return;
				}
				var box = qs('[data-role="search-results"]', scope);
				if (box) {
					box.classList.remove("is-open");
				}
			});
		});
	}

	/* ---------------------------------------------------------------------
	 * 5. 工具 / 网址前端筛选
	 * ------------------------------------------------------------------ */
	function initHubFilter() {
		qsa("[data-hub]").forEach(function (hub) {
			var input = qs('[data-role="hub-search"]', hub);
			var chips = qsa(".tw-chip[data-filter]", hub);
			var items = qsa('[data-role="tool-item"], [data-role="site-item"]', hub);
			var empty = qs('[data-role="hub-empty"]', hub);
			var countBox = qs('[data-role="hub-count"]', hub);
			var countTpl = countBox ? countBox.getAttribute("data-count-tpl") || "" : "";

			if (!items.length) {
				return;
			}

			var state = { term: "", cat: "all" };

			function apply() {
				var visible = 0;

				items.forEach(function (item) {
					var name = (item.getAttribute("data-name") || "").toLowerCase();
					var cats = (item.getAttribute("data-cats") || "").split(",");
					var text = name + " " + (item.textContent || "").toLowerCase();

					var matchTerm = !state.term || text.indexOf(state.term) > -1;
					var matchCat = state.cat === "all" || cats.indexOf(state.cat) > -1;
					var show = matchTerm && matchCat;

					item.hidden = !show;
					if (show) {
						visible += 1;
					}
				});

				if (empty) {
					empty.hidden = visible > 0;
				}
				if (countBox && countTpl) {
					countBox.textContent = countTpl.replace("%d", String(visible));
				}

				// 隐藏没有可见条目的网址分组。
				qsa('[data-role="site-group"]', hub).forEach(function (group) {
					var hasVisible = qsa('[data-role="site-item"]', group).some(function (node) {
						return !node.hidden;
					});
					group.hidden = !hasVisible;
				});
			}

			function activate(slug) {
				var matched = chips.filter(function (chip) {
					return chip.getAttribute("data-filter") === slug;
				})[0];

				chips.forEach(function (chip) {
					chip.classList.remove("is-active");
				});
				(matched || chips[0] || { classList: { add: function () {} } }).classList.add("is-active");
				state.cat = matched ? slug : "all";
			}

			if (input) {
				input.addEventListener(
					"input",
					debounce(function () {
						state.term = input.value.trim().toLowerCase();
						apply();
					}, 120)
				);

				// 从其他页面跳转过来时，用 ?q= 预填关键词。
				var preset = new URLSearchParams(window.location.search).get("q");
				if (preset) {
					input.value = preset;
					state.term = preset.trim().toLowerCase();
				}
			}

			// 支持 #cat-<分类> 锚点直接定位分类。
			if (window.location.hash.indexOf("#cat-") === 0) {
				activate(decodeURIComponent(window.location.hash.slice(5)));
			}

			chips.forEach(function (chip) {
				chip.addEventListener("click", function () {
					activate(chip.getAttribute("data-filter") || "all");
					apply();
				});
			});

			apply();
		});
	}

	/* ---------------------------------------------------------------------
	 * 6. 复制按钮
	 * ------------------------------------------------------------------ */
	function initCopyButtons() {
		document.addEventListener("click", function (event) {
			var button = event.target.closest("[data-copy]");
			if (!button) {
				return;
			}

			event.preventDefault();

			var selector = button.getAttribute("data-copy");
			var source = selector === "self" ? null : qs(selector);
			var value = "";

			if (selector === "self") {
				value = button.getAttribute("data-copy-value") || "";
			} else if (source) {
				value = "value" in source ? source.value : source.textContent;
			}

			if (!value) {
				toast(I18N.empty, "err");
				return;
			}

			copyText(value).then(function (ok) {
				toast(ok ? I18N.copied : I18N.copyFail, ok ? "ok" : "err");
			});
		});
	}

	/* ---------------------------------------------------------------------
	 * 7. 回到顶部 + 页头滚动状态
	 * ------------------------------------------------------------------ */
	function initScrollUi() {
		var header = qs("#tw-header");
		var toTop = qs('[data-action="totop"]');

		function onScroll() {
			var y = window.pageYOffset || document.documentElement.scrollTop;
			if (header) {
				header.classList.toggle("is-scrolled", y > 8);
			}
			if (toTop) {
				toTop.hidden = y < 480;
			}
		}

		window.addEventListener("scroll", throttle(onScroll), { passive: true });
		onScroll();

		if (toTop) {
			toTop.addEventListener("click", function () {
				window.scrollTo({ top: 0, behavior: "smooth" });
			});
		}
	}

	/* ---------------------------------------------------------------------
	 * 启动
	 * ------------------------------------------------------------------ */
	function boot() {
		initThemeToggle();
		initDrawer();
		initSearchPanel();
		initLiveSearch();
		initHubFilter();
		initCopyButtons();
		initScrollUi();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
