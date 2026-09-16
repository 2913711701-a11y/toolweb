/**
 * 网址数据源 —— 网址导航的全部条目。
 *
 * 每个条目的字段：
 *   name      必填，站点名称
 *   url       必填，完整链接（https:// 开头）
 *   icon      必填，Emoji 图标
 *   category  必填，所属分类，同名自动归为同一分类
 *   desc      可选，一句话简介
 *   featured  可选，true 表示进入首页「精选网址」区块（默认 true）
 *
 * 网址卡片点击后在新标签页打开，自动附加 rel="noopener nofollow"。
 * 网址不生成独立详情页 —— 卡片直接指向目标站点，页面数量保持最少。
 */
module.exports = [
	{
		name: "GitHub",
		url: "https://github.com",
		icon: "🐙",
		category: "开发社区",
		desc: "全球最大的代码托管平台，汇聚开源项目与协作开发工具。",
	},
	{
		name: "Stack Overflow",
		url: "https://stackoverflow.com",
		icon: "📚",
		category: "开发社区",
		desc: "程序员问答社区，绝大多数编程疑难问题都能在这里找到答案。",
	},
	{
		name: "npm",
		url: "https://www.npmjs.com",
		icon: "📦",
		category: "开发社区",
		desc: "Node.js 与前端生态的包管理仓库，查找与比较依赖首选的站点。",
	},
	{
		name: "MDN Web Docs",
		url: "https://developer.mozilla.org",
		icon: "🦊",
		category: "学习资源",
		desc: "Mozilla 维护的 Web 技术权威文档，前端开发者必备参考。",
	},
	{
		name: "Can I use",
		url: "https://caniuse.com",
		icon: "✅",
		category: "学习资源",
		desc: "查询各浏览器对 HTML、CSS、JS 特性的兼容性支持情况。",
	},
	{
		name: "Coursera",
		url: "https://www.coursera.org",
		icon: "🎓",
		category: "学习资源",
		desc: "汇聚全球高校与企业课程的大规模在线学习平台。",
	},
	{
		name: "Figma",
		url: "https://www.figma.com",
		icon: "🎨",
		category: "设计素材",
		desc: "浏览器端界面设计协作工具，支持多人实时编辑与原型演示。",
	},
	{
		name: "Unsplash",
		url: "https://unsplash.com",
		icon: "🖼️",
		category: "设计素材",
		desc: "高质量免费图库，商用友好，适合作为文章配图与设计底图。",
	},
	{
		name: "iconfont",
		url: "https://www.iconfont.cn",
		icon: "🔤",
		category: "设计素材",
		desc: "阿里巴巴矢量图标库，可自定义颜色与尺寸并打包下载。",
	},
	{
		name: "掘金",
		url: "https://juejin.cn",
		icon: "⛏️",
		category: "资讯社区",
		desc: "面向中文开发者的技术内容社区，前端与后端实践文章丰富。",
	},
];
