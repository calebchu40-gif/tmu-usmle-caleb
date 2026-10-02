# TMU USMLE Caleb

个人学习题库，使用 GitHub Pages 发布。HTML、CSS 和 JavaScript 都包含在页面内，无需安装依赖或构建。

## 访问地址

完成下方首次发布设置后：

- 学习工作台：https://calebchu40-gif.github.io/tmu-usmle-caleb/
- 基础科学演示：https://calebchu40-gif.github.io/tmu-usmle-caleb/1.html

网页公开访问。练习进度只保存在当前页面内存中，刷新后重置，各设备之间不自动同步。

## 首次发布

打开仓库 **Settings → Pages**：

1. Source 选择 **Deploy from a branch**。
2. Branch 选择 **main**，文件夹选择 **/ (root)**。
3. 点击 **Save**，等待 Pages 部署完成。

设置地址：https://github.com/calebchu40-gif/tmu-usmle-caleb/settings/pages

## 以后上传 HTML

1. 在仓库根目录点击 **Add file → Upload files**。
2. 上传 HTML。如果页面引用独立的图片、CSS 或 JavaScript，也要上传这些文件并保留原目录结构。
3. 提交到 `main` 分支，等待 Pages 部署完成。
4. 例如根目录的 `2.html`，访问地址就是 `https://calebchu40-gif.github.io/tmu-usmle-caleb/2.html`。

上传同名文件会更新原网页。新增页面可以直接通过网址访问；需要在首页显示入口时，手动添加链接，例如 `<a href="./2.html">我的第二个页面</a>`。

用相对路径引用资源，例如 `./images/photo.png`，这样仓库网址和未来的自定义域名都能使用。

## 文件来源

- `index.html`：来自现有 `study-question-bank/index.html`。
- `1.html`：来自现有 `study-question-bank-test-site/index.html`。
- 保留原有题目、布局、答题与解析逻辑，调整公开部署说明并添加页面之间的链接。
- `.nojekyll`：让 GitHub Pages 直接发布静态文件。

## 以后绑定域名

拥有域名后，在 **Settings → Pages → Custom domain** 填入域名，再按 GitHub 官方说明设置域名解析并启用 HTTPS。自定义域名绑定到本仓库后，`1.html` 可通过 `https://你的域名/1.html` 访问。

[GitHub Pages 自定义域名说明](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
