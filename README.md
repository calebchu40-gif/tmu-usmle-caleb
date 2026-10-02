# USMLE Step 1 自建题库

网站：https://calebchu40-gif.github.io/tmu-usmle-caleb/

GitHub Pages 首页直接打开题库，不再套用旧工作台。题目按 First Aid 章节和小节筛选，支持日常练习、测试模式、计时、答案解析和题面图片。

## 发布内容

构建产物仅包含：

- `index.html` 与 `qbank.html`：同一题库页面，前者是网站首页。
- `data/questions.json`：结构化题目与解析。
- `assets/question-pages/`：题目所需原始题面截图。

旧示例页、工作台、账号/云端管理、上传模板和开发中间文件不进入 GitHub Pages 构建产物。原有输入资料不在构建中删除或改写；源 PDF 应留在本机资料目录，不随公开网站发布。

## 本地检查与发布

题目数据中的来源文件名与源 PDF 页码仍保留。包含图片题目时，同时在 `assets/question-pages/` 中保存题面截图，并通过 `question_images` 字段关联。部署前运行 `npm test` 与 `npm run build`；推送到 `main` 后 GitHub Actions 自动构建并发布。

目前 First Aid 印刷页码是自动匹配候选，尚未逐题人工核验；OCR 解析也需要继续校对。题目与配图为公开网站内容，答题状态目前仅保存在当前设备/浏览器，不跨设备同步。
