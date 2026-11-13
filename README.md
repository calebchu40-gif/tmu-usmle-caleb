# TMU · Caleb 学习工作台

网站：https://www.tmu-usmle-caleb.cn/
仓库：https://github.com/calebchu40-gif/tmu-usmle-caleb

公开共享的学习站点：不需要注册，也不需要登录。所有访问者看到的工作台目录、题库内容、解析和图片都完全一致。

## 页面

- `/`：学习工作台。左侧按分类列出全部页面，支持搜索、收藏、学习记录与标记复习；页面在隔离的 iframe 中打开。
- `/qbank.html`：USMLE Step 1 自建题库。按 First Aid 章节/小节筛选，支持日常刷题、测试模式、正计时/倒计时、解析和题面图。
- `/基础科学/…`、`/生物化学/…`：独立小节题库。可从工作台内嵌打开，也可以直接访问网址。

## 数据与进度

- 页面和题目全部是仓库里的静态文件，构建时复制到 `dist/`，由 GitHub Pages 发布。
- 站点没有账号系统，也不连接任何后端数据库。答题记录、笔记、收藏和复习标记保存在当前浏览器（localStorage），不跨设备同步。
- 工作台「学习记录」页可以导出 JSON，也可以用两次确认清除本机全部记录。

## 本地检查与发布

- `npm test`：Python 构建测试 + Node/DOM 测试。
- `npm run build`：生成 `dist/`。
- 推送到 `main` 后，`.github/workflows/pages.yml` 自动测试、构建并把 `dist/` 发布到 GitHub Pages。

## 站点设置

- Settings → Pages 的 Source 为 **GitHub Actions**。
- 自定义域名 `www.tmu-usmle-caleb.cn` 的 DNS CNAME 指向 `calebchu40-gif.github.io`。

## 内容说明

First Aid 印刷页码是自动匹配的候选，尚未逐题人工核验；解析基于源文件 OCR，仍在校对中。题目与配图属于公开网站内容，请勿放入未审核的原始 OCR 截图。
