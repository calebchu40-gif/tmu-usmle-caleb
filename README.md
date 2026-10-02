# TMU · Caleb 学习工作台

固定左侧导航，在右侧显示上传的 HTML。支持自动分类目录、搜索、收藏、分享链接和手机导航，保留内容页面自身的样式和答题交互。

**网站：https://calebchu40-gif.github.io/tmu-usmle-caleb/**

## 文件命名

内容文件统一使用 **分类/知识点.html**，文件名、HTML 的 `<title>` 和页面主标题使用同一个知识点名称。例如：

```text
基础科学/
  细胞周期与遗传信息.html
生物化学/
  新生儿黄疸与核黄素.html
```

分类名称自动取自文件夹，页面名称取自 `<title>`，没有标题时使用文件名。目录自动生成，不需要手动编辑首页。

## 上传新内容

1. 点击网站左下角「上传 HTML」，或在 GitHub 仓库点击 **Add file → Upload files**。
2. 上传按分类整理好的文件夹，例如 `解剖学/上肢骨骼.html`。文件使用 UTF-8 编码；独立图片、CSS 和 JavaScript 一起上传，保留原来的相对路径。
3. 提交到 `main`，等待 Actions 中 **Publish HTML library** 显示成功。
4. 刷新网站，新页面自动出现在左侧分类中。替换文件会更新页面，删除文件会从目录中移除。

`index.html` 是框架首页；`assets/`、`scripts/`、`tests/`、`.github/` 是框架目录。内容放在自己创建的分类文件夹内，压缩包需先解压再上传。

## 网址规则

- 框架首页：`https://calebchu40-gif.github.io/tmu-usmle-caleb/`
- 带导航的内容页：`https://calebchu40-gif.github.io/tmu-usmle-caleb/#/page/基础科学%2F细胞周期与遗传信息.html`
- 独立内容页：`https://calebchu40-gif.github.io/tmu-usmle-caleb/基础科学/细胞周期与遗传信息.html`

分享时点击「复制链接」，系统会正确处理中文、空格和路径编码。对方打开链接后会保留左侧导航并显示同一篇内容。浏览器刷新、前进和后退均可使用。点击「独立打开」只查看原 HTML。

所有内容页均已改为分类和知识点命名，旧编号网址已移除，不提供跳转。

## 嵌入显示与记录

框架通过 iframe 显示内容。现有两份题库已适配嵌入模式：框架内隐藏它们自带的重复导航，独立打开时保留完整布局。以后上传的 HTML 默认按其自身布局显示；页面如需适配，可读取 `embedded=1` 查询参数。

收藏保存在当前浏览器，刷新后仍保留，不跨设备同步。题库答题进度沿用内容页面自己的逻辑，现有题库刷新或切换到另一篇内容后会重置。框架不自动拆解任意 HTML 中的题目。

## 站点配置

`site.config.json` 指定站点名、默认内容，也可以覆盖某一页面的目录标题和分类。普通上传不需要修改配置。

```json
{
  "title": "TMU · Caleb",
  "defaultPage": "生物化学/新生儿黄疸与核黄素.html",
  "pages": {}
}
```

需要自定义时，在 `pages` 中以文件相对路径为键，设置 `title` 和 `category`。默认页面被删除时，会选择剩余页面；没有内容时显示空目录提示。

## 项目结构

- `index.html`：固定导航和内容容器。
- `assets/app.css`、`assets/app.js`：布局、搜索、路由、收藏。
- 各分类文件夹：可独立打开的 HTML 内容及其资源。
- `site.config.json`：站点名、默认页和可选目录信息。
- `scripts/build.py`：扫描内容并生成 `dist/assets/pages.json`。
- `.github/workflows/pages.yml`：提交后自动测试、构建和发布。
- `tests/`：页面自动发现、分类、路由、收藏、答题和异常场景测试。
- `dist/`：生成的发布文件，不提交到 Git。

## 本地预览和测试

构建使用 Python 3 标准库，网站运行不依赖第三方前端框架或 CDN。

```sh
python3 scripts/build.py
python3 -m http.server 8000 --directory dist
```

打开 `http://localhost:8000/`。修改文件后重新构建并刷新。

运行全部测试需要 Node.js 24；测试依赖不会发布到网站：

```sh
npm ci
npm test
node --check assets/app.js
```

## GitHub 发布

仓库 **Settings → Pages → Source** 使用 **GitHub Actions**。每次提交到 `main` 都会生成最新目录并发布 `dist/`。工作流失败时保留上一次成功部署的网站，错误可在 Actions 日志中查看。

源码、开发配置、测试依赖和历史仓库文件不会复制到发布目录。仓库本身为公开仓库。

## 绑定自己的域名

以后在 **Settings → Pages → Custom domain** 绑定你拥有的域名并配置 DNS。框架使用相对路径，绑定域名后可以继续使用；分类和知识点路径保持不变。
